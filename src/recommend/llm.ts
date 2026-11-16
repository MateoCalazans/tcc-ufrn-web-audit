import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import Anthropic from "@anthropic-ai/sdk";
import type { CheerioAPI } from "cheerio";

import { type Landmarks, landmarks, type No, papelLandmark, roleExplicito } from "../analyze/semantics.js";
import type { Achado, Edicao, Har, Rule } from "../shared/types.js";
import { readCsvObjects } from "../shared/csv.js";
import { aplicarEdicoes } from "./engine.js";
import { type Element, evidenciaTag, locFim, locTag, parsear, posicao } from "./html.js";
import { bytesNoHar } from "./rules/img-dimensions.js";

/**
 * LLM para landmarks (S16, ADR 016). Um único caso: a página não tem algum dos
 * 4 landmarks (ADR 010) e o modelo propõe qual `<div>` existente vira
 * `header`/`nav`/`main`/`footer`.
 *
 * - Entrada do modelo: um esqueleto compacto dos `<div>` candidatos, não o HTML.
 * - Saída: JSON estruturado (`output_config.format`), revalidado aqui.
 * - Correção: só troca o nome da tag de abertura e de fechamento (posições de
 *   origem, ADR 014), então o texto não muda; mesmo assim, o texto e o efeito
 *   nos landmarks são conferidos antes de aceitar as edições.
 * - O cliente do modelo é injetado: os testes usam uma resposta fixa.
 */

// --------------------------------------------------------------------------
// Prompt versionado (docs/prompts/landmarks-v1.md)
// --------------------------------------------------------------------------

export const PROMPT_PADRAO = "docs/prompts/landmarks-v1.md";

export interface PromptLandmarks {
  /** Nome do arquivo sem extensão (ex.: `landmarks-v1`). */
  versao: string;
  sha256: string;
  modelo: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens: number;
  sistema: string;
  usuario: string;
  esquema: Record<string, unknown>;
}

/** Lê o cabeçalho e os blocos do arquivo do prompt (fonte única: o código não repete o texto). */
export function lerPrompt(conteudo: string, versao: string): PromptLandmarks {
  const campo = (nome: string): string => {
    const m = new RegExp(`^${nome}:\\s*(\\S+)`, "m").exec(conteudo);
    if (!m) throw new Error(`prompt ${versao}: campo "${nome}" ausente no cabeçalho`);
    return m[1]!;
  };
  const bloco = (titulo: string, lingua: string): string => {
    const i = conteudo.indexOf(`## ${titulo}`);
    if (i < 0) throw new Error(`prompt ${versao}: seção "${titulo}" ausente`);
    const m = new RegExp("```" + lingua + "\\r?\\n([\\s\\S]*?)\\r?\\n```").exec(conteudo.slice(i));
    if (!m) throw new Error(`prompt ${versao}: bloco ${lingua} ausente em "${titulo}"`);
    return m[1]!;
  };
  const effort = campo("effort");
  if (!["low", "medium", "high", "xhigh", "max"].includes(effort)) throw new Error(`prompt ${versao}: effort inválido`);
  const maxTokens = Number(campo("max_tokens"));
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) throw new Error(`prompt ${versao}: max_tokens inválido`);
  return {
    versao,
    sha256: createHash("sha256").update(conteudo.replace(/\r\n/g, "\n")).digest("hex"),
    modelo: campo("modelo"),
    effort: effort as PromptLandmarks["effort"],
    maxTokens,
    sistema: bloco("Prompt de sistema", "text"),
    usuario: bloco("Prompt do usuário", "text"),
    esquema: JSON.parse(bloco("Esquema JSON de saída", "json")) as Record<string, unknown>,
  };
}

export function carregarPrompt(caminho = PROMPT_PADRAO): PromptLandmarks {
  const versao = caminho.replace(/^.*[\\/]/, "").replace(/\.md$/, "");
  return lerPrompt(readFileSync(caminho, "utf8"), versao);
}

/** Troca `{{chave}}` pelos valores; placeholder sem valor é erro (prompt e código fora de sincronia). */
export function preencher(modelo: string, valores: Record<string, string | number>): string {
  return modelo.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    if (!(k in valores)) throw new Error(`placeholder sem valor: {{${k}}}`);
    return String(valores[k]);
  });
}

// --------------------------------------------------------------------------
// Esqueleto (entrada do modelo)
// --------------------------------------------------------------------------

export const MAX_CANDIDATOS = 150;
const MAX_TEXTO = 80;
const MAX_CLASSE = 80;

const IGNORADOS = new Set(["script", "style", "template", "noscript"]);
const FOLHAS = new Set(["svg", "math"]);
const SECIONADORAS = new Set(["article", "aside", "main", "nav", "section", "header", "footer"]);
const ROLES_SECIONADORAS = new Set(["article", "complementary", "main", "navigation", "region", "banner", "contentinfo"]);

interface NoDom extends No {
  parent?: NoDom | null;
  children?: NoDom[];
  data?: string;
}

export interface Candidato {
  id: string;
  el: Element;
  profundidade: number;
  pai: string | null;
  linha: string;
}

export interface Esqueleto {
  candidatos: Candidato[];
  /** Total de `<div>` elegíveis antes do corte em `MAX_CANDIDATOS`. */
  elegiveis: number;
  texto: string;
}

const nomeDe = (n: NoDom): string => (n.name ?? "").toLowerCase();
const ehTag = (n: NoDom): boolean => n.type === "tag" || n.type === "script" || n.type === "style";
const normalizar = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Texto do nó sem `script/style/template/noscript` (o que o usuário lê). */
function textoDe(n: NoDom): string {
  if (n.type === "text") return n.data ?? "";
  if (ehTag(n) && IGNORADOS.has(nomeDe(n))) return "";
  return (n.children ?? []).map(textoDe).join(" ");
}

/** Texto do `body` normalizado, usado para conferir que a correção não muda o conteúdo. */
export function textoDoCorpo($: CheerioAPI): string {
  const body = $("body").get(0) as unknown as NoDom | undefined;
  return body ? normalizar(textoDe(body)) : "";
}

function contagem(itens: string[]): string {
  const ordem: string[] = [];
  const n = new Map<string, number>();
  for (const t of itens) {
    if (!n.has(t)) ordem.push(t);
    n.set(t, (n.get(t) ?? 0) + 1);
  }
  return ordem.map((t) => (n.get(t)! > 1 ? `${t}×${n.get(t)}` : t)).join(",");
}

/**
 * `<div>` elegíveis: visíveis, sem `role`, com abertura e fechamento no
 * arquivo (para a troca do nome), com texto ou imagem, e fora de landmarks e
 * de elementos secionadores (um `header` lá dentro não seria banner).
 */
export function montarEsqueleto($: CheerioAPI): Esqueleto {
  const elegiveis: Array<{ el: NoDom; prof: number; pai: NoDom | null; ordem: number }> = [];
  let ordem = 0;
  const ir = (n: NoDom, prof: number, pai: NoDom | null) => {
    for (const f of n.children ?? []) {
      if (!ehTag(f)) continue;
      const t = nomeDe(f);
      if (IGNORADOS.has(t) || f.attribs?.hidden !== undefined) continue;
      if (FOLHAS.has(t)) continue;
      const r = roleExplicito(f);
      if (papelLandmark(f, false) !== null || SECIONADORAS.has(t) || (r !== null && ROLES_SECIONADORAS.has(r))) continue;
      let filhoPai = pai;
      let filhoProf = prof;
      if (t === "div" && r === null && locTag(f as unknown as Element) !== null && locFim(f as unknown as Element) !== null) {
        const temConteudo = normalizar(textoDe(f)) !== "" || $(f as never).find("img").length > 0;
        if (temConteudo) {
          elegiveis.push({ el: f, prof, pai, ordem: ordem++ });
          filhoPai = f;
          filhoProf = prof + 1;
        }
      }
      ir(f, filhoProf, filhoPai);
    }
  };
  const body = $("body").get(0) as unknown as NoDom | undefined;
  if (body) ir(body, 0, null);

  const escolhidos = [...elegiveis].sort((a, b) => a.prof - b.prof || a.ordem - b.ordem).slice(0, MAX_CANDIDATOS);
  escolhidos.sort((a, b) => a.prof - b.prof || a.ordem - b.ordem);
  const ids = new Map<NoDom, string>();
  escolhidos.forEach((c, i) => ids.set(c.el, `c${i + 1}`));

  const candidatos = escolhidos.map((c): Candidato => {
    const id = ids.get(c.el)!;
    const pai = c.pai === null ? null : (ids.get(c.pai) ?? null);
    const a = c.el.attribs ?? {};
    const classe = normalizar(a.class ?? "");
    const tag =
      "<div" +
      (a.id !== undefined ? ` id="${normalizar(a.id)}"` : "") +
      (classe !== "" ? ` class="${classe.length > MAX_CLASSE ? classe.slice(0, MAX_CLASSE - 1) + "…" : classe}"` : "") +
      ">";
    const $el = $(c.el as never);
    const filhos = contagem((c.el.children ?? []).filter((f) => ehTag(f) && !IGNORADOS.has(nomeDe(f))).map(nomeDe));
    const titulos = contagem($el.find("h1,h2,h3,h4,h5,h6").toArray().map((h) => (h as unknown as NoDom).name!.toLowerCase()));
    const texto = normalizar(textoDe(c.el));
    const trecho = texto.length > MAX_TEXTO ? texto.slice(0, MAX_TEXTO - 1) + "…" : texto;
    const linha =
      `${id} prof=${c.prof} pai=${pai ?? "-"} ${tag} filhos=[${filhos}] links=${$el.find("a[href]").length} ` +
      `títulos=[${titulos}] form=${$el.find("form").length} img=${$el.find("img").length} texto=${JSON.stringify(trecho)}`;
    return { id, el: c.el as unknown as Element, profundidade: c.prof, pai, linha };
  });
  return { candidatos, elegiveis: elegiveis.length, texto: candidatos.map((c) => c.linha).join("\n") };
}

// --------------------------------------------------------------------------
// Validação da resposta
// --------------------------------------------------------------------------

export type ElementoLandmark = "header" | "nav" | "main" | "footer";
const ELEMENTOS: readonly ElementoLandmark[] = ["header", "nav", "main", "footer"];
const PAPEL: Record<ElementoLandmark, keyof Landmarks> = { header: "banner", nav: "navigation", main: "main", footer: "contentinfo" };
const ELEMENTO_DO_PAPEL: Record<keyof Landmarks, ElementoLandmark> = { banner: "header", navigation: "nav", main: "main", contentinfo: "footer" };
/** Máximo de propostas por elemento (o prompt diz o mesmo). */
const LIMITE: Record<ElementoLandmark, number> = { header: 1, nav: 2, main: 1, footer: 1 };

export interface Proposta {
  candidato: string;
  elemento: ElementoLandmark;
  justificativa: string;
}

export interface Rejeitada {
  candidato: string;
  elemento: string;
  motivo: string;
}

/** Confere a forma da saída do modelo; `null` se não for o JSON do esquema. */
export function lerSaida(texto: string): Proposta[] | null {
  let obj: unknown;
  try {
    obj = JSON.parse(texto);
  } catch {
    return null;
  }
  const propostas = (obj as { propostas?: unknown } | null)?.propostas;
  if (!Array.isArray(propostas)) return null;
  const ok = propostas.every(
    (p: unknown) =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as Proposta).candidato === "string" &&
      ELEMENTOS.includes((p as Proposta).elemento) &&
      typeof (p as Proposta).justificativa === "string",
  );
  return ok ? (propostas as Proposta[]) : null;
}

/** `true` se `a` contém `b` na árvore. */
function contem(a: Element, b: Element): boolean {
  for (let p = (b as unknown as NoDom).parent; p; p = p.parent) if (p === (a as unknown as NoDom)) return true;
  return false;
}

/**
 * Regras do ADR 016 sobre as propostas, na ordem da resposta: candidato
 * existente e não repetido, landmark ausente, limite por elemento e sem
 * aninhamento entre propostas (exceto `nav` dentro de `header`/`footer`).
 */
export function validarPropostas(
  propostas: Proposta[],
  candidatos: Candidato[],
  ausentes: ReadonlySet<ElementoLandmark>,
): { validas: Array<Proposta & { el: Element }>; rejeitadas: Rejeitada[] } {
  const porId = new Map(candidatos.map((c) => [c.id, c]));
  const validas: Array<Proposta & { el: Element }> = [];
  const rejeitadas: Rejeitada[] = [];
  const rejeitar = (p: Proposta, motivo: string) => rejeitadas.push({ candidato: p.candidato, elemento: p.elemento, motivo });

  for (const p of propostas) {
    const c = porId.get(p.candidato);
    if (c === undefined) {
      rejeitar(p, "candidato inexistente");
      continue;
    }
    if (!ausentes.has(p.elemento)) {
      rejeitar(p, "landmark já presente ou não pedido");
      continue;
    }
    if (validas.some((v) => v.candidato === p.candidato)) {
      rejeitar(p, "candidato repetido");
      continue;
    }
    if (validas.filter((v) => v.elemento === p.elemento).length >= LIMITE[p.elemento]) {
      rejeitar(p, `excede o limite de ${LIMITE[p.elemento]} ${p.elemento}`);
      continue;
    }
    const navEmBloco = (dentro: ElementoLandmark, fora: ElementoLandmark) => dentro === "nav" && (fora === "header" || fora === "footer");
    const choque = validas.find(
      (v) => (contem(v.el, c.el) && !navEmBloco(p.elemento, v.elemento)) || (contem(c.el, v.el) && !navEmBloco(v.elemento, p.elemento)),
    );
    if (choque !== undefined) {
      rejeitar(p, `aninhamento com ${choque.candidato} (${choque.elemento})`);
      continue;
    }
    validas.push({ ...p, el: c.el });
  }
  return { validas, rejeitadas };
}

/** Edições que trocam `<div`/`</div` pelo elemento proposto (posições de origem, ADR 014). */
export function edicoesDeTroca(html: string, el: Element, elemento: ElementoLandmark): Edicao[] | null {
  const ini = locTag(el);
  const fim = locFim(el);
  if (ini === null || fim === null) return null;
  if (html.slice(ini.startOffset, ini.startOffset + 4).toLowerCase() !== "<div") return null;
  if (html.slice(fim.startOffset, fim.startOffset + 5).toLowerCase() !== "</div") return null;
  return [
    { inicio: ini.startOffset + 1, fim: ini.startOffset + 4, texto: elemento },
    { inicio: fim.startOffset + 2, fim: fim.startOffset + 5, texto: elemento },
  ];
}

// --------------------------------------------------------------------------
// Chamada ao modelo (injetável)
// --------------------------------------------------------------------------

export interface PedidoModelo {
  modelo: string;
  effort: PromptLandmarks["effort"];
  maxTokens: number;
  sistema: string;
  usuario: string;
  esquema: Record<string, unknown>;
}

export interface RespostaModelo {
  id: string | null;
  modelo: string | null;
  stopReason: string | null;
  /** Texto dos blocos `text` (o JSON); `null` se não houve. */
  texto: string | null;
  inputTokens: number;
  outputTokens: number;
}

export type ChamarModelo = (pedido: PedidoModelo) => Promise<RespostaModelo>;

/** Chamada real à API (SDK oficial). O cliente só é criado na 1ª chamada. */
export function chamadorAnthropic(criar: () => Anthropic = () => new Anthropic()): ChamarModelo {
  let client: Anthropic | null = null;
  return async (p) => {
    client ??= criar();
    const r = await client.messages.create({
      model: p.modelo,
      max_tokens: p.maxTokens,
      system: p.sistema,
      messages: [{ role: "user", content: p.usuario }],
      output_config: { effort: p.effort, format: { type: "json_schema", schema: p.esquema } },
    });
    const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return {
      id: r.id,
      modelo: r.model,
      stopReason: r.stop_reason,
      texto: texto === "" ? null : texto,
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
    };
  };
}

/**
 * Preço em US$ por 1M de tokens (tabela da documentação da Anthropic,
 * consultada em 2026-11-16). Claude Haiku 5.5: US$ 0,10/0,50 até 100 mil tokens
 * de prompt; US$ 0,50/2,50 acima. Modelo sem preço → custo `null`.
 */
const PRECOS: Record<string, { limite: number; ate: [number, number]; acima: [number, number] }> = {
  "claude-haiku-5-5": { limite: 100_000, ate: [0.1, 0.5], acima: [0.5, 2.5] },
};

export function custoUsd(modelo: string, entrada: number, saida: number): number | null {
  const p = PRECOS[modelo];
  if (p === undefined) return null;
  const [pe, ps] = entrada <= p.limite ? p.ate : p.acima;
  return (entrada * pe + saida * ps) / 1_000_000;
}

/**
 * Pior caso de custo de uma chamada, para o teto de gasto: entrada estimada com
 * folga (1 token a cada 2 caracteres; o real fica perto de 1 a cada 3–4) e saída
 * igual a `max_tokens` (o pensamento conta como saída). `null` se o modelo não tem preço.
 */
export function custoMaximoChamada(modelo: string, caracteresEntrada: number, maxTokens: number): number | null {
  return custoUsd(modelo, Math.ceil(caracteresEntrada / 2), maxTokens);
}

/** Soma da coluna `custo_usd` de um `llm-runs.csv` (0 se o arquivo não existe). */
export function gastoRegistrado(caminho: string): number {
  if (!existsSync(caminho)) return 0;
  return readCsvObjects(caminho).reduce((s, l) => s + (Number(l.custo_usd) || 0), 0);
}

// --------------------------------------------------------------------------
// CSS que depende do nome da tag (S16, adendo ao ADR 016)
// --------------------------------------------------------------------------

/**
 * Textos de CSS da página: os `<style>` e as folhas `<link rel="stylesheet">`
 * encontradas no HAR da coleta (sem rede). `@import` não é seguido.
 */
export function folhasDeEstilo($: CheerioAPI, url: string, har: Har | undefined): string[] {
  const folhas = $("style").toArray().map((s) => $(s).text());
  for (const l of $('link[rel~="stylesheet" i][href]').toArray()) {
    let abs: string;
    try {
      abs = new URL($(l).attr("href")!, url).href.replace(/#.*$/, "");
    } catch {
      continue;
    }
    const b = bytesNoHar(har, abs);
    if (b !== null) folhas.push(b.toString("utf8"));
  }
  return folhas;
}

/**
 * Declarações sem efeito na troca: `div`, `header`, `nav`, `main` e `footer` têm o
 * mesmo estilo padrão no navegador (só `display: block`, sem margem nem padding),
 * então resets e o normalize.css não mudam nada ao trocar a tag.
 */
const DECLARACOES_NEUTRAS = new Set([
  "display:block",
  "margin:0",
  "padding:0",
  "border:0",
  "border:none",
  "outline:0",
  "vertical-align:baseline",
  "font-size:100%",
  "font:inherit",
]);

/** Uma regra de estilo: seus seletores (separados por vírgula fora de parênteses). */
export interface RegraCss {
  seletores: string[];
}

/**
 * Regras de estilo (ignora at-rules como prelúdio; desce em `@media`). Regras só com
 * declarações neutras (`DECLARACOES_NEUTRAS`) ficam de fora.
 */
export function regrasCss(css: string): RegraCss[] {
  const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: RegraCss[] = [];
  for (const m of semComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = m[1]!.trim();
    if (prelude === "" || prelude.startsWith("@")) continue;
    const decl = m[2]!.split(";").map((d) => d.replace(/\s|!important/gi, "").toLowerCase()).filter((d) => d !== "");
    if (decl.every((d) => DECLARACOES_NEUTRAS.has(d.replace(/:0(px|em|rem)?$/, ":0")))) continue;
    const seletores: string[] = [];
    let prof = 0;
    let atual = "";
    for (const ch of prelude) {
      if (ch === "(") prof++;
      else if (ch === ")") prof--;
      if (ch === "," && prof === 0) {
        seletores.push(atual.trim());
        atual = "";
      } else atual += ch;
    }
    seletores.push(atual.trim());
    out.push({ seletores: seletores.filter((s) => s !== "") });
  }
  return out;
}

/** Seletor que cita `div`/`header`/`nav`/`main`/`footer` como tipo (não `.main`, `#nav`). */
const TIPO_TROCAVEL = /(^|[\s>+~(])(div|header|nav|main|footer)(?![\w-])/i;

/**
 * Seletores (com tipo trocável) das regras cujo conjunto de elementos muda com a
 * troca. A regra é avaliada inteira: em `div, main { … }` o elemento continua
 * selecionado. Os elementos são comparados pela ordem no documento (a troca não
 * muda a árvore). Pseudo-classes e pseudo-elementos simples (`:hover`,
 * `::before`…) são removidos antes; seletor que o cheerio não entende é ignorado.
 */
export function seletoresAfetados(folhas: string[], antes: CheerioAPI, depois: CheerioAPI): string[] {
  const indices = ($: CheerioAPI) => new Map($("*").toArray().map((el, i) => [el, i] as const));
  const [ia, id] = [indices(antes), indices(depois)];
  const alvo = ($: CheerioAPI, idx: Map<unknown, number>, seletores: string[]) => {
    const s = new Set<number>();
    for (const sel of seletores) {
      const limpo = sel.replace(/::?[\w-]+(?![\w(-])/g, "").trim() || "*";
      try {
        for (const el of $(limpo).toArray()) s.add(idx.get(el)!);
      } catch {
        // seletor fora do que o css-select suporta
      }
    }
    return s;
  };
  const afetados = new Set<string>();
  for (const { seletores } of folhas.flatMap(regrasCss)) {
    if (!seletores.some((s) => TIPO_TROCAVEL.test(s))) continue;
    const [a, d] = [alvo(antes, ia, seletores), alvo(depois, id, seletores)];
    if (a.size !== d.size || [...a].some((i) => !d.has(i))) {
      for (const s of seletores.filter((s) => TIPO_TROCAVEL.test(s))) afetados.add(s);
    }
  }
  return [...afetados];
}

// --------------------------------------------------------------------------
// Regra
// --------------------------------------------------------------------------

/** Uma linha do `data/processed/llm-runs.csv` (uma por site avaliado). */
export interface ExecucaoLlm {
  siteId: string;
  prompt: string;
  promptSha256: string;
  modelo: string;
  modeloResposta: string | null;
  respostaId: string | null;
  /** `false` quando não houve chamada (nada ausente ou sem candidatos). */
  chamada: boolean;
  motivo: string | null;
  ausentes: ElementoLandmark[];
  candidatos: number;
  elegiveis: number;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  custoUsd: number | null;
  propostas: number;
  validas: number;
  rejeitadas: Rejeitada[];
  /** Texto do `body` igual depois das trocas (`null` se não houve troca). */
  textoIgual: boolean | null;
  /** Landmarks do HTML com as trocas aplicadas (`null` se não houve troca). */
  landmarksDepois: Landmarks | null;
  erro: string | null;
  duracaoMs: number;
}

/** Colunas do `data/processed/llm-runs.csv`, em ordem fixa. */
export const COLUNAS_LLM_RUNS = [
  "data",
  "git_commit",
  "site",
  "prompt",
  "prompt_sha256",
  "modelo",
  "modelo_resposta",
  "resposta_id",
  "chamada",
  "motivo",
  "ausentes",
  "candidatos",
  "elegiveis",
  "stop_reason",
  "input_tokens",
  "output_tokens",
  "custo_usd",
  "propostas",
  "validas",
  "rejeitadas",
  "texto_igual",
  "erro",
  "duracao_ms",
] as const;

const celulaCsv = (v: string | number | boolean | null): string => {
  const s = v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Linha do CSV (sem quebra no fim). `rejeitadas` vai como JSON numa célula. */
export function linhaLlmRuns(e: ExecucaoLlm, data: string, gitCommit: string | null): string {
  const v: Record<(typeof COLUNAS_LLM_RUNS)[number], string | number | boolean | null> = {
    data,
    git_commit: gitCommit,
    site: e.siteId,
    prompt: e.prompt,
    prompt_sha256: e.promptSha256,
    modelo: e.modelo,
    modelo_resposta: e.modeloResposta,
    resposta_id: e.respostaId,
    chamada: e.chamada,
    motivo: e.motivo,
    ausentes: e.ausentes.join(" "),
    candidatos: e.candidatos,
    elegiveis: e.elegiveis,
    stop_reason: e.stopReason,
    input_tokens: e.inputTokens,
    output_tokens: e.outputTokens,
    custo_usd: e.custoUsd === null ? null : Number(e.custoUsd.toFixed(8)),
    propostas: e.propostas,
    validas: e.validas,
    rejeitadas: e.rejeitadas.length === 0 ? "" : JSON.stringify(e.rejeitadas),
    texto_igual: e.textoIgual,
    erro: e.erro,
    duracao_ms: e.duracaoMs,
  };
  return COLUNAS_LLM_RUNS.map((c) => celulaCsv(v[c])).join(",");
}

export interface OpcoesRegraLlm {
  chamar: ChamarModelo;
  prompt: PromptLandmarks;
  /** Recebe o registro de cada site (para o `llm-runs.csv`). */
  registrar: (e: ExecucaoLlm) => void;
  /**
   * Teto de gasto (US$). Antes de cada chamada: se `gastoUsd()` + o pior caso da
   * chamada passa do teto, ou o modelo não tem preço, não chama
   * (motivo "orçamento esgotado"). Sem `orcamento`, não há teto (testes).
   */
  orcamento?: { tetoUsd: number; gastoUsd: () => number };
}

export const ID_REGRA_LLM = "landmarks-llm";

export function criarRegraLandmarks({ chamar, prompt, registrar, orcamento }: OpcoesRegraLlm): Rule {
  return {
    id: ID_REGRA_LLM,
    dimensao: "semantica",
    severidade: "media",
    descricao: `Landmarks ausentes propostos por LLM sobre <div> existentes (${prompt.versao}, ${prompt.modelo}).`,
    async avaliar({ siteId, url, html, $, har }): Promise<Achado[]> {
      const t0 = performance.now();
      const presentes = landmarks($);
      const ausentes = (Object.keys(presentes) as Array<keyof Landmarks>).filter((k) => presentes[k] === 0).map((k) => ELEMENTO_DO_PAPEL[k]);
      const esq = montarEsqueleto($);
      const exec: ExecucaoLlm = {
        siteId,
        prompt: prompt.versao,
        promptSha256: prompt.sha256,
        modelo: prompt.modelo,
        modeloResposta: null,
        respostaId: null,
        chamada: false,
        motivo: null,
        ausentes,
        candidatos: esq.candidatos.length,
        elegiveis: esq.elegiveis,
        stopReason: null,
        inputTokens: 0,
        outputTokens: 0,
        custoUsd: null,
        propostas: 0,
        validas: 0,
        rejeitadas: [],
        textoIgual: null,
        landmarksDepois: null,
        erro: null,
        duracaoMs: 0,
      };
      const fim = (achados: Achado[]) => {
        exec.duracaoMs = Math.round(performance.now() - t0);
        registrar(exec);
        return achados;
      };
      if (ausentes.length === 0 || esq.candidatos.length === 0) {
        exec.motivo = ausentes.length === 0 ? "nenhum landmark ausente" : "nenhum <div> candidato";
        return fim([]);
      }

      const titulo = normalizar($("title").first().text());
      const usuario = preencher(prompt.usuario, {
        url,
        titulo: titulo === "" ? "(sem título)" : titulo,
        presentes: (Object.keys(presentes) as Array<keyof Landmarks>)
          .filter((k) => presentes[k] > 0)
          .map((k) => ELEMENTO_DO_PAPEL[k])
          .join(", ") || "nenhum",
        ausentes: ausentes.join(", "),
        n: esq.candidatos.length,
        total: esq.elegiveis,
        esqueleto: esq.texto,
      });

      if (orcamento !== undefined) {
        const pior = custoMaximoChamada(prompt.modelo, prompt.sistema.length + usuario.length, prompt.maxTokens);
        if (pior === null || orcamento.gastoUsd() + pior > orcamento.tetoUsd) {
          exec.motivo = "orçamento esgotado";
          return fim([]);
        }
      }

      let resp: RespostaModelo;
      exec.chamada = true;
      try {
        resp = await chamar({ modelo: prompt.modelo, effort: prompt.effort, maxTokens: prompt.maxTokens, sistema: prompt.sistema, usuario, esquema: prompt.esquema });
      } catch (e) {
        exec.erro = `chamada: ${(e as Error).message}`;
        return fim([]);
      }
      exec.modeloResposta = resp.modelo;
      exec.respostaId = resp.id;
      exec.stopReason = resp.stopReason;
      exec.inputTokens = resp.inputTokens;
      exec.outputTokens = resp.outputTokens;
      exec.custoUsd = custoUsd(prompt.modelo, resp.inputTokens, resp.outputTokens);
      if (resp.stopReason !== "end_turn") {
        exec.erro = `stop_reason ${resp.stopReason ?? "nulo"}`;
        return fim([]);
      }
      const propostas = resp.texto === null ? null : lerSaida(resp.texto);
      if (propostas === null) {
        exec.erro = "saída fora do esquema";
        return fim([]);
      }
      exec.propostas = propostas.length;
      const { validas, rejeitadas } = validarPropostas(propostas, esq.candidatos, new Set(ausentes));
      exec.rejeitadas = rejeitadas;
      exec.validas = validas.length;

      const trocas = validas.map((v) => ({ v, edicoes: edicoesDeTroca(html, v.el, v.elemento) }));
      for (const t of trocas.filter((t) => t.edicoes === null)) {
        exec.rejeitadas.push({ candidato: t.v.candidato, elemento: t.v.elemento, motivo: "tag não localizada no arquivo" });
      }
      const aceitas = trocas.filter((t): t is { v: (typeof validas)[number]; edicoes: Edicao[] } => t.edicoes !== null);
      exec.validas = aceitas.length;

      // Conferência do resultado: mesmo texto e os landmarks esperados presentes.
      // E nenhum seletor do CSS da página muda de alvo com a troca (ex.: `div#content`).
      let aplicar = false;
      let css: string[] = [];
      if (aceitas.length > 0) {
        const $depois = parsear(aplicarEdicoes(html, aceitas.flatMap((t) => t.edicoes)));
        exec.textoIgual = textoDoCorpo($depois) === textoDoCorpo($);
        exec.landmarksDepois = landmarks($depois);
        const efeito = aceitas.every((t) => exec.landmarksDepois![PAPEL[t.v.elemento]] > 0);
        aplicar = exec.textoIgual && efeito;
        if (!aplicar) exec.erro = exec.textoIgual ? "troca sem o efeito esperado nos landmarks" : "troca mudou o texto";
        else {
          css = seletoresAfetados(folhasDeEstilo($, url, har), $, $depois);
          if (css.length > 0) {
            aplicar = false;
            exec.erro = `CSS depende da tag: ${css.join(" | ")}`;
          }
        }
      }
      const semCorrecao =
        css.length > 0
          ? ` Sem correção automática: o CSS da página seleciona pela tag (${css.slice(0, 3).join(", ")}${css.length > 3 ? ", …" : ""}); ajustar os seletores antes de trocar.`
          : " Sem correção automática: a verificação do resultado falhou.";

      return fim(
        aceitas.map(({ v, edicoes }) => ({
          dimensao: "semantica",
          severidade: "media",
          evidencia: evidenciaTag(html, v.el),
          posicao: posicao(locTag(v.el)),
          mensagem:
            `Landmark ${PAPEL[v.elemento]} ausente: trocar este <div> por <${v.elemento}>. ` +
            `Justificativa do modelo: ${JSON.stringify(v.justificativa)}. ` +
            `Proposta gerada por LLM (${prompt.versao}, ${prompt.modelo}, candidato ${v.candidato}); ` +
            `conferir CSS e scripts que selecionem "div" neste elemento.` +
            (aplicar ? "" : semCorrecao),
          edicoes: aplicar ? edicoes : [],
        })),
      );
    },
  };
}
