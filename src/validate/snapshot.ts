import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Meta } from "../shared/types.js";

/**
 * Módulo 4 — cópia local servível (S17, ADR 017).
 *
 * A cópia é montada a partir do `page.har` da coleta congelada, sem nenhuma
 * requisição nova aos sites (regras 7 e 8). Cada recurso do HAR vira um
 * arquivo em `snapshot/arquivos/<hash>`, e um manifesto liga a URL local
 * (caminho + query) ao arquivo, com status, `Content-Type` e redirecionamento.
 *
 * As URLs absolutas são reescritas só no esquema e no host:
 *   - host principal → caminho relativo à raiz (`https://h/p?q` → `/p?q`);
 *   - outros hosts do HAR → `/_ext/<host>` (`https://cdn/x` → `/_ext/cdn/x`).
 * A reescrita vale para o HTML e para todo recurso de texto (CSS, JS, JSON,
 * SVG), inclusive `//host` e a forma escapada `https:\/\/host` de JSON/JS.
 *
 * O HTML original (`index.html`) e o corrigido (`fixed.html`) passam pela
 * MESMA função (`prepararHtml`): a diferença entre as duas cópias fica só nas
 * correções do módulo 3.
 */

export const PREFIXO_EXTERNO = "/_ext/";
export const DIR_SNAPSHOT = "snapshot";
export const ARQ_MANIFESTO = "manifest.json";

/** Subconjunto do HAR 1.2 gravado pelo Playwright (`content: "embed"`). */
export interface HarCompleto {
  log: {
    entries: Array<{
      request: { method: string; url: string };
      response: {
        status: number;
        redirectURL?: string;
        headers?: Array<{ name: string; value: string }>;
        content: { mimeType?: string; text?: string; encoding?: string };
      };
    }>;
  };
}

export type MotivoAusencia =
  | "falha-na-coleta" // status <= 0 no HAR: a requisição já falhou na coleta
  | "sem-corpo" // resposta registrada sem corpo (ex.: 204, abortada, 1xx)
  | "metodo-nao-get" // POST etc.: a cópia estática só serve GET
  | "url-nao-http"; // data:, blob:, chrome-extension:...

/** Problemas registrados como limitação (o recurso não foi trazido ou veio alterado). */
export interface Limitacao {
  url: string;
  motivo: MotivoAusencia | "texto-corrompido";
}

export interface EntradaManifesto {
  url: string;
  status: number;
  contentType: string | null;
  /** Nome do arquivo em `arquivos/` (hash do conteúdo), ou `null` para redirecionamento sem corpo. */
  arquivo: string | null;
  /** `Location` já reescrito para caminho local. */
  location?: string;
}

export interface Manifesto {
  meta: Meta & { fonte: string };
  siteId: string;
  /** URL de onde o HTML foi obtido na coleta (`raw.finalUrl`). */
  urlPagina: string;
  /** Caminho local em que a página é servida (mesmo caminho da URL original). */
  caminhoPagina: string;
  contentTypePagina: string;
  hostPrincipal: string;
  hostsExternos: string[];
  variantes: { original: string; corrigido: string | null };
  entradas: Record<string, EntradaManifesto>;
  limitacoes: Limitacao[];
  resumo: {
    entradasHar: number;
    servidas: number;
    redirecionamentos: number;
    limitacoesPorMotivo: Record<string, number>;
  };
}

// --------------------------------------------------------------------------
// Funções puras
// --------------------------------------------------------------------------

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Caminho local de uma URL: chave do manifesto e destino da reescrita. */
export function caminhoLocal(url: string, hostPrincipal: string): string {
  const u = new URL(url);
  const caminho = `${u.pathname}${u.search}`;
  return u.host.toLowerCase() === hostPrincipal.toLowerCase() ? caminho : `${PREFIXO_EXTERNO}${u.host.toLowerCase()}${caminho}`;
}

/**
 * Reescreve as referências absolutas aos hosts dados. Só o esquema e o host
 * mudam; caminho, query e fragmento ficam como estão. Hosts fora da lista
 * (ex.: links para outros sites) não são tocados.
 *
 * Formas cobertas: `https://h`, `http://h`, `//h` e as mesmas com barras
 * escapadas (`https:\/\/h`), comuns em JSON embutido no JS.
 */
export function reescreverUrls(texto: string, hostPrincipal: string, hostsExternos: readonly string[]): string {
  const hosts = [hostPrincipal, ...hostsExternos].filter((h, i, a) => h && a.indexOf(h) === i);
  if (hosts.length === 0) return texto;
  // Hosts mais longos primeiro, para "a.b.c" não ser engolido por "b.c" (o `//` antes já impede, mas fica explícito).
  const alternativa = hosts.sort((a, b) => b.length - a.length).map(escaparRegex).join("|");
  // Sem esquema, o `//` não pode vir colado a palavra, `/`, `:` ou `\` (ex.: `/foo//h`).
  const re = new RegExp(String.raw`(?:https?:|(?<![\w/:\\]))(\\?/\\?/)(${alternativa})(?=([/\\?#"'\s)<>,;]|$))`, "gi");
  const principal = hostPrincipal.toLowerCase();
  return texto.replace(re, (_m, barras: string, host: string, seguinte: string | undefined) => {
    const escapado = barras.includes("\\");
    const barra = escapado ? "\\/" : "/";
    const temBarraDepois = seguinte === "/" || seguinte === "\\";
    const h = host.toLowerCase();
    if (h === principal) return temBarraDepois ? "" : barra;
    const destino = `${barra}_ext${barra}${h}`;
    return temBarraDepois ? destino : `${destino}${barra}`;
  });
}

/**
 * Num recurso de outro host servido em `/_ext/<host>/...`, os caminhos
 * relativos à raiz (`/x`) passariam a apontar para a raiz do servidor local.
 * Esta função os ancora em `/_ext/<host>`. Cobre CSS (`url(/x)`,
 * `@import "/x"`) e atributos de HTML (`src`, `href`, `action`, `poster`);
 * caminhos montados em JS não são cobertos (limitação do ADR 017).
 */
export function ancorarRaizExterna(texto: string, host: string, contentType: string): string {
  const prefixo = `${PREFIXO_EXTERNO}${host.toLowerCase()}`;
  if (/css/i.test(contentType)) {
    return texto
      .replace(/(url\(\s*['"]?)\/(?![/\\])/gi, `$1${prefixo}/`)
      .replace(/(@import\s+['"])\/(?![/\\])/gi, `$1${prefixo}/`);
  }
  if (/html/i.test(contentType)) {
    return texto.replace(/(\s(?:src|href|action|poster)\s*=\s*['"]?)\/(?![/\\])/gi, `$1${prefixo}/`);
  }
  return texto;
}

/**
 * Remove os atributos `integrity` (SRI) das tags: a reescrita muda o
 * conteúdo dos CSS/JS e o hash deixaria de bater, bloqueando o recurso.
 */
export function removerIntegridade(html: string): string {
  return html.replace(/<[a-z][^>]*>/gi, (tag) => tag.replace(/\s+integrity\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/gi, ""));
}

/**
 * Transformação aplicada igualmente ao HTML original e ao corrigido. Os bytes
 * são lidos como latin1, que mapeia byte a byte: hosts são ASCII, então a
 * reescrita não toca nos demais bytes, qualquer que seja o charset da página.
 */
export function prepararHtml(bytes: Buffer, hostPrincipal: string, hostsExternos: readonly string[]): Buffer {
  const texto = bytes.toString("latin1");
  return Buffer.from(removerIntegridade(reescreverUrls(texto, hostPrincipal, hostsExternos)), "latin1");
}

function cabecalho(headers: Array<{ name: string; value: string }> | undefined, nome: string): string | null {
  return headers?.find((h) => h.name.toLowerCase() === nome)?.value ?? null;
}

/** `Content-Type` com o charset trocado por UTF-8 (o texto do HAR já vem decodificado em UTF-8). */
export function comCharsetUtf8(contentType: string): string {
  const base = contentType.split(";")[0]!.trim();
  return `${base}; charset=utf-8`;
}

const hashDe = (b: Buffer) => createHash("sha256").update(b).digest("hex").slice(0, 32);

export interface Montagem {
  hostsExternos: string[];
  entradas: Record<string, EntradaManifesto>;
  arquivos: Map<string, Buffer>;
  limitacoes: Limitacao[];
  entradasHar: number;
}

/**
 * Monta as entradas do manifesto a partir do HAR. Por URL local, vale a
 * primeira resposta com corpo (2xx antes de 4xx/5xx), senão o primeiro
 * redirecionamento. A página principal (`caminhoPagina`) fica de fora: ela é
 * servida a partir do `index.html` ou do `fixed.html`.
 */
export function montarDoHar(har: HarCompleto, hostPrincipal: string, caminhoPagina: string): Montagem {
  const entries = har.log.entries;
  const hostsExternos: string[] = [];
  for (const e of entries) {
    let u: URL;
    try {
      u = new URL(e.request.url);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol)) continue;
    const h = u.host.toLowerCase();
    if (h !== hostPrincipal.toLowerCase() && !hostsExternos.includes(h)) hostsExternos.push(h);
  }

  const limitacoes: Limitacao[] = [];
  const arquivos = new Map<string, Buffer>();
  const candidatos = new Map<string, { prioridade: number; entrada: EntradaManifesto }>();
  const vistosAusentes = new Set<string>();
  const ausente = (url: string, motivo: Limitacao["motivo"]) => {
    const k = `${motivo} ${url}`;
    if (!vistosAusentes.has(k)) {
      vistosAusentes.add(k);
      limitacoes.push({ url, motivo });
    }
  };

  for (const e of entries) {
    const url = e.request.url;
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      ausente(url, "url-nao-http");
      continue;
    }
    if (!/^https?:$/.test(u.protocol)) {
      ausente(url, "url-nao-http");
      continue;
    }
    if (e.request.method.toUpperCase() !== "GET") {
      ausente(url, "metodo-nao-get");
      continue;
    }
    const chave = caminhoLocal(url, hostPrincipal);
    if (chave === caminhoPagina) continue;
    const { status, content } = e.response;
    if (status <= 0) {
      ausente(url, "falha-na-coleta");
      continue;
    }
    const contentType = cabecalho(e.response.headers, "content-type") ?? content.mimeType ?? null;

    let prioridade: number;
    let entrada: EntradaManifesto;
    if (status >= 300 && status < 400 && e.response.redirectURL) {
      const destino = new URL(e.response.redirectURL, url).href;
      const location = caminhoLocal(destino, hostPrincipal);
      if (location === chave) continue; // redirecionamento para si mesmo: serviria um laço
      prioridade = 2;
      entrada = { url, status, contentType: null, arquivo: null, location };
    } else if (content.text != null && status >= 200) {
      let corpo: Buffer;
      let tipo = contentType;
      if (content.encoding === "base64") {
        corpo = Buffer.from(content.text, "base64");
      } else {
        // Texto: já decodificado pelo Playwright como UTF-8. Reescrever e servir em UTF-8.
        if (content.text.includes("�")) ausente(url, "texto-corrompido");
        tipo = comCharsetUtf8(contentType ?? "text/plain");
        // Ancorar ANTES de reescrever: depois, as URLs absolutas do host principal também começariam por "/".
        const externo = u.host.toLowerCase() !== hostPrincipal.toLowerCase();
        const ancorado = externo ? ancorarRaizExterna(content.text, u.host, tipo) : content.text;
        corpo = Buffer.from(reescreverUrls(ancorado, hostPrincipal, hostsExternos), "utf8");
      }
      prioridade = status < 300 ? 0 : 1;
      const arquivo = hashDe(corpo);
      arquivos.set(arquivo, corpo);
      entrada = { url, status, contentType: tipo, arquivo };
    } else {
      ausente(url, "sem-corpo");
      continue;
    }
    const atual = candidatos.get(chave);
    if (!atual || prioridade < atual.prioridade) candidatos.set(chave, { prioridade, entrada });
  }

  // Um recurso que acabou servido não é limitação por "sem-corpo"/"falha" em outra tentativa.
  const servidas = new Set([...candidatos.values()].map((c) => c.entrada.url));
  const filtradas = limitacoes.filter((l) => l.motivo === "texto-corrompido" || !servidas.has(l.url));

  const entradas: Record<string, EntradaManifesto> = {};
  for (const [k, c] of candidatos) entradas[k] = c.entrada;
  // Só os arquivos referenciados (uma resposta descartada pode ter deixado arquivo).
  const usados = new Set(Object.values(entradas).map((e) => e.arquivo).filter((a): a is string => a !== null));
  for (const a of [...arquivos.keys()]) if (!usados.has(a)) arquivos.delete(a);

  return { hostsExternos, entradas, arquivos, limitacoes: filtradas, entradasHar: entries.length };
}

export function contarPorMotivo(limitacoes: readonly Limitacao[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const l of limitacoes) r[l.motivo] = (r[l.motivo] ?? 0) + 1;
  return r;
}

// --------------------------------------------------------------------------
// E/S
// --------------------------------------------------------------------------

export interface FontesSnapshot {
  siteId: string;
  /** `data/raw/<id>` (só leitura). */
  dirRaw: string;
  /** `data/processed/sites/<id>` (o `fixed.html` vem daqui, se existir). */
  dirProcessado: string;
  meta: Meta;
}

/**
 * Grava `data/processed/sites/<id>/snapshot/`: `manifest.json`,
 * `original.html`, `corrigido.html` (se houver `fixed.html`) e `arquivos/`.
 * Apaga a cópia anterior antes, para não sobrar arquivo de outra montagem.
 */
export function gravarSnapshot(f: FontesSnapshot): Manifesto {
  const collect = JSON.parse(readFileSync(join(f.dirRaw, "collect.json"), "utf8")) as {
    url: string;
    raw?: { finalUrl?: string | null; headers?: Record<string, string> };
  };
  const urlPagina = collect.raw?.finalUrl ?? collect.url;
  const hostPrincipal = new URL(urlPagina).host.toLowerCase();
  const caminhoPagina = caminhoLocal(urlPagina, hostPrincipal);
  const har = JSON.parse(readFileSync(join(f.dirRaw, "page.har"), "utf8")) as HarCompleto;
  const m = montarDoHar(har, hostPrincipal, caminhoPagina);

  const dir = join(f.dirProcessado, DIR_SNAPSHOT);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "arquivos"), { recursive: true });
  for (const [nome, corpo] of m.arquivos) writeFileSync(join(dir, "arquivos", nome), corpo);

  const original = prepararHtml(readFileSync(join(f.dirRaw, "index.html")), hostPrincipal, m.hostsExternos);
  writeFileSync(join(dir, "original.html"), original);
  const fixed = join(f.dirProcessado, "fixed.html");
  let corrigido: string | null = null;
  if (existsSync(fixed)) {
    writeFileSync(join(dir, "corrigido.html"), prepararHtml(readFileSync(fixed), hostPrincipal, m.hostsExternos));
    corrigido = "corrigido.html";
  }

  const manifesto: Manifesto = {
    meta: { ...f.meta, fonte: "data/raw/<id>/page.har + index.html (coleta congelada) e fixed.html (módulo 3)" },
    siteId: f.siteId,
    urlPagina,
    caminhoPagina,
    contentTypePagina: collect.raw?.headers?.["content-type"] ?? "text/html",
    hostPrincipal,
    hostsExternos: m.hostsExternos,
    variantes: { original: "original.html", corrigido },
    entradas: m.entradas,
    limitacoes: m.limitacoes,
    resumo: {
      entradasHar: m.entradasHar,
      servidas: Object.values(m.entradas).filter((e) => e.arquivo !== null).length,
      redirecionamentos: Object.values(m.entradas).filter((e) => e.location !== undefined).length,
      limitacoesPorMotivo: contarPorMotivo(m.limitacoes),
    },
  };
  writeFileSync(join(dir, ARQ_MANIFESTO), JSON.stringify(manifesto, null, 2) + "\n", "utf8");
  return manifesto;
}
