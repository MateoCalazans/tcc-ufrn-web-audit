import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { ARQ_MANIFESTO, type EntradaManifesto, type Manifesto } from "./snapshot.js";

/**
 * Servidor estático da cópia local (S17, ADR 018). O MESMO código serve a
 * variante original e a corrigida, cada uma na sua porta: só o HTML da página
 * muda entre as duas. Regras iguais para os dois lados:
 *   - `Cache-Control: no-store` (cada execução do Lighthouse baixa tudo);
 *   - gzip para tipos de texto, se o cliente aceitar;
 *   - URL fora do manifesto → 404, registrada em `faltas`.
 */

export type Variante = "original" | "corrigido";

export interface Resposta {
  status: number;
  headers: Record<string, string>;
  corpo: Buffer | null;
  /** `exata`, `sem-query` (mesmo caminho, query diferente) ou `falta`. */
  correspondencia: "pagina" | "exata" | "sem-query" | "falta";
}

const TEXTO = /^(text\/|application\/(javascript|x-javascript|json|xml|xhtml\+xml|manifest\+json)|image\/svg\+xml)/i;

/** Índice de caminhos sem query → chaves, para o fallback `sem-query`. */
export function indicePorCaminho(entradas: Record<string, EntradaManifesto>): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const k of Object.keys(entradas)) {
    const caminho = k.split("?")[0]!;
    idx.set(caminho, [...(idx.get(caminho) ?? []), k]);
  }
  return idx;
}

/**
 * Resolve uma requisição (função pura sobre o manifesto). `lerArquivo` lê
 * de `arquivos/`. Fallback `sem-query`: se a URL exata não está no
 * manifesto, mas o caminho tem exatamente uma entrada (ex.: query de
 * cache-busting gerada por script), serve essa entrada e marca.
 */
export function resolver(
  m: Manifesto,
  idx: Map<string, string[]>,
  url: string,
  pagina: Buffer,
  lerArquivo: (nome: string) => Buffer,
): Resposta {
  const base = { "cache-control": "no-store" };
  let caminho = url;
  // `/_ext/host` sem barra final equivale a `/_ext/host/`.
  if (/^\/_ext\/[^/?]+(\?|$)/.test(caminho)) caminho = caminho.replace(/^(\/_ext\/[^/?]+)/, "$1/");
  // A página: caminho exato, ou o mesmo caminho com outra query que não esteja no manifesto.
  const mesmaPagina = caminho.split("?")[0] === m.caminhoPagina.split("?")[0] && !m.entradas[caminho];
  if (caminho === m.caminhoPagina || mesmaPagina) {
    return { status: 200, headers: { ...base, "content-type": m.contentTypePagina }, corpo: pagina, correspondencia: "pagina" };
  }
  let chave: string | undefined = m.entradas[caminho] ? caminho : undefined;
  let correspondencia: Resposta["correspondencia"] = "exata";
  if (!chave) {
    const candidatas = idx.get(caminho.split("?")[0]!) ?? [];
    if (candidatas.length === 1) {
      chave = candidatas[0];
      correspondencia = "sem-query";
    }
  }
  if (!chave) return { status: 404, headers: base, corpo: null, correspondencia: "falta" };
  const e = m.entradas[chave]!;
  const headers: Record<string, string> = { ...base };
  if (e.contentType) headers["content-type"] = e.contentType;
  if (e.location) headers.location = e.location;
  return { status: e.status, headers, corpo: e.arquivo ? lerArquivo(e.arquivo) : null, correspondencia };
}

export interface ServidorSnapshot {
  url: string;
  urlPagina: string;
  porta: number;
  /** Requisições sem correspondência no manifesto (404), na ordem em que chegaram. */
  faltas: string[];
  /** Requisições servidas por `sem-query`. */
  aproximadas: string[];
  fechar(): Promise<void>;
}

export async function servirSnapshot(dirSnapshot: string, variante: Variante, porta = 0): Promise<ServidorSnapshot> {
  const m = JSON.parse(readFileSync(join(dirSnapshot, ARQ_MANIFESTO), "utf8")) as Manifesto;
  const arqPagina = m.variantes[variante];
  if (!arqPagina) throw new Error(`variante ${variante} não existe na cópia de ${m.siteId} (falta fixed.html?)`);
  const pagina = readFileSync(join(dirSnapshot, arqPagina));
  const idx = indicePorCaminho(m.entradas);
  const cache = new Map<string, Buffer>();
  const lerArquivo = (nome: string) => {
    let b = cache.get(nome);
    if (!b) cache.set(nome, (b = readFileSync(join(dirSnapshot, "arquivos", nome))));
    return b;
  };
  const faltas: string[] = [];
  const aproximadas: string[] = [];

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    const r = resolver(m, idx, url, pagina, lerArquivo);
    if (r.correspondencia === "falta") faltas.push(url);
    if (r.correspondencia === "sem-query") aproximadas.push(url);
    let corpo = r.corpo;
    const headers = { ...r.headers };
    if (corpo && TEXTO.test(headers["content-type"] ?? "") && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
      corpo = gzipSync(corpo);
      headers["content-encoding"] = "gzip";
      headers.vary = "Accept-Encoding";
    }
    if (corpo) headers["content-length"] = String(corpo.length);
    res.writeHead(r.status, headers);
    res.end(req.method === "HEAD" ? undefined : (corpo ?? undefined));
  });
  await new Promise<void>((ok) => server.listen(porta, "127.0.0.1", ok));
  const p = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${p}`;
  return {
    url,
    urlPagina: `${url}${m.caminhoPagina}`,
    porta: p,
    faltas,
    aproximadas,
    fechar: () =>
      new Promise<void>((ok, erro) => {
        server.closeAllConnections();
        server.close((e) => (e ? erro(e) : ok()));
      }),
  };
}
