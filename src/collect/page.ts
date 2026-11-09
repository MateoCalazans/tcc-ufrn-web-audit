import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Browser } from "playwright";
import { Agent, fetch as undiciFetch } from "undici";

import { defaultLimiter, type HostLimiter } from "../shared/http.js";
import type { ToolVersions } from "../shared/types.js";

/**
 * Coleta da página inicial de um site (S05, ADR 006). Para cada site grava em
 * `data/raw/<id>/`:
 *   - `index.html`    — bytes da resposta HTTP, exatamente como recebidos;
 *   - `rendered.html` — DOM serializado pelo Chromium após o `networkidle`;
 *   - `screenshot.png`— só a viewport mobile;
 *   - `page.har`      — todas as requisições da navegação, com corpos;
 *   - `collect.json`  — meta, tempos, status e erros de cada etapa.
 * Uma etapa que falha não impede as outras; o erro fica no `collect.json`.
 */

// --------------------------------------------------------------------------
// Parâmetros (ADR 006)
// --------------------------------------------------------------------------

/**
 * Emulação de tela do Lighthouse mobile (Moto G Power) — mesma do
 * `screenEmulationMetrics.mobile` do Lighthouse 13 (teste garante a sincronia).
 */
export const MOBILE_SCREEN = {
  width: 412,
  height: 823,
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
} as const;

/** Teto para a navegação chegar ao `domcontentloaded`. */
export const NAV_TIMEOUT_MS = 30_000;
/** Teto para o `networkidle` depois do `domcontentloaded`. */
export const NETWORKIDLE_TIMEOUT_MS = 30_000;
/** Timeout de conexão do GET bruto (igual ao da triagem, ADR 002). */
export const RAW_CONNECT_TIMEOUT_MS = 15_000;
/** Timeout total do GET bruto (conexão + 5 s para a resposta, como na triagem). */
export const RAW_TOTAL_TIMEOUT_MS = 20_000;

export const FILES = {
  raw: "index.html",
  rendered: "rendered.html",
  screenshot: "screenshot.png",
  har: "page.har",
  record: "collect.json",
} as const;

// --------------------------------------------------------------------------
// Seleção dos sites (pura)
// --------------------------------------------------------------------------

export interface SiteToCollect {
  id: string;
  url: string;
  tlsInvalido: boolean;
}

export interface SelectOptions {
  limit?: number;
  site?: string;
}

/**
 * Sites a coletar a partir das linhas do `corpus.csv`: só incluídos, na ordem
 * do arquivo; URL = `url_final` (ou `https://<id>/` se vazia).
 */
export function sitesFromCorpus(
  rows: Array<Record<string, string>>,
  options: SelectOptions = {},
): SiteToCollect[] {
  let sites = rows
    .filter((r) => r.incluido === "true")
    .map((r) => ({
      id: r.id ?? "",
      url: r.url_final?.trim() || `https://${r.id}/`,
      // No corpus a coluna guarda a causa (`cert-expirado`…) ou fica vazia.
      tlsInvalido: (r.tls_invalido ?? "").trim() !== "" && r.tls_invalido !== "false",
    }))
    .filter((s) => s.id !== "");
  if (options.site !== undefined) sites = sites.filter((s) => s.id === options.site);
  if (options.limit !== undefined) sites = sites.slice(0, options.limit);
  return sites;
}

export const siteDir = (rawDir: string, id: string): string => join(rawDir, id);

/** Regra 8: pasta com `collect.json` já foi coletada e não é tocada de novo. */
export function alreadyCollected(rawDir: string, id: string): boolean {
  return existsSync(join(siteDir(rawDir, id), FILES.record));
}

// --------------------------------------------------------------------------
// Erros
// --------------------------------------------------------------------------

/** Mensagem curta e estável de um erro (inclui o `code` da causa do undici). */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  const code =
    cause && typeof cause === "object" && "code" in cause ? String((cause as { code: unknown }).code) : null;
  const first = err.message.split("\n")[0] ?? "";
  return code ? `${err.name}: ${first} (${code})` : `${err.name}: ${first}`;
}

// --------------------------------------------------------------------------
// Meta refresh (pura)
// --------------------------------------------------------------------------

export interface MetaRefresh {
  /** Valor bruto do atributo `content` (ex.: `0;url=/inicio`). */
  conteudo: string;
  /** Segundos antes do redirecionamento; `null` se não for um número. */
  atrasoS: number | null;
  /** URL de destino absoluta; `null` se a tag só recarrega a própria página. */
  destino: string | null;
}

/** Valor de um atributo HTML numa tag (aspas duplas, simples ou sem aspas). */
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

/**
 * Primeira `<meta http-equiv="refresh">` do HTML (comentários ignorados).
 * Redirecionamento feito pelo HTML, com status 200: o `fetch` não o segue,
 * o navegador sim — então nesses sites `index.html` e `rendered.html` são
 * páginas diferentes. `baseUrl` resolve destinos relativos.
 */
export function detectMetaRefresh(html: string, baseUrl: string): MetaRefresh | null {
  const semComentarios = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const [tag] of semComentarios.matchAll(/<meta\b[^>]*>/gi)) {
    if ((attr(tag, "http-equiv") ?? "").trim().toLowerCase() !== "refresh") continue;
    const conteudo = (attr(tag, "content") ?? "").trim();
    const m = /^\s*(\d+(?:\.\d+)?)?\s*[;,]?\s*(?:url\s*=\s*)?(.*)$/i.exec(conteudo);
    const atrasoS = m?.[1] !== undefined ? Number(m[1]) : null;
    const alvo = (m?.[2] ?? "").trim().replace(/^(['"])(.*)\1$/, "$2").trim();
    let destino: string | null = null;
    if (alvo !== "") {
      try {
        destino = new URL(alvo, baseUrl).href;
      } catch {
        destino = alvo;
      }
    }
    return { conteudo, atrasoS, destino };
  }
  return null;
}

// --------------------------------------------------------------------------
// Etapa 1 — HTML bruto
// --------------------------------------------------------------------------

export interface RawResult {
  ok: boolean;
  finalUrl: string | null;
  status: number | null;
  headers: Record<string, string>;
  bytes: number | null;
  startedAt: string;
  durationMs: number;
  error: string | null;
}

export interface CollectDeps {
  userAgent: string;
  limiter?: HostLimiter;
}

export async function fetchRaw(
  site: SiteToCollect,
  outFile: string,
  deps: CollectDeps,
): Promise<RawResult> {
  const limiter = deps.limiter ?? defaultLimiter;
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const dispatcher = new Agent({
    connect: { timeout: RAW_CONNECT_TIMEOUT_MS, rejectUnauthorized: !site.tlsInvalido },
  });
  try {
    return await limiter.schedule(new URL(site.url).host, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), RAW_TOTAL_TIMEOUT_MS);
      try {
        const res = await undiciFetch(site.url, {
          redirect: "follow",
          signal: controller.signal,
          headers: { "User-Agent": deps.userAgent },
          dispatcher,
        });
        const body = new Uint8Array(await res.arrayBuffer());
        writeFileSync(outFile, body);
        const headers: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return {
          ok: true,
          finalUrl: res.url,
          status: res.status,
          headers,
          bytes: body.byteLength,
          startedAt,
          durationMs: Math.round(performance.now() - t0),
          error: null,
        };
      } finally {
        clearTimeout(timer);
      }
    });
  } catch (err) {
    return {
      ok: false,
      finalUrl: null,
      status: null,
      headers: {},
      bytes: null,
      startedAt,
      durationMs: Math.round(performance.now() - t0),
      error: describeError(err),
    };
  } finally {
    await dispatcher.close().catch(() => undefined);
  }
}

// --------------------------------------------------------------------------
// Etapa 2 — página renderizada (DOM, screenshot, HAR)
// --------------------------------------------------------------------------

export interface RenderResult {
  ok: boolean;
  finalUrl: string | null;
  status: number | null;
  /** `true` se o `networkidle` não chegou em `NETWORKIDLE_TIMEOUT_MS`. */
  networkidleTimeout: boolean;
  startedAt: string;
  domContentLoadedMs: number | null;
  networkidleMs: number | null;
  durationMs: number;
  renderedBytes: number | null;
  error: string | null;
}

export async function renderPage(
  browser: Browser,
  site: SiteToCollect,
  dir: string,
  deps: CollectDeps,
): Promise<RenderResult> {
  const limiter = deps.limiter ?? defaultLimiter;
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  const result: RenderResult = {
    ok: false,
    finalUrl: null,
    status: null,
    networkidleTimeout: false,
    startedAt,
    domContentLoadedMs: null,
    networkidleMs: null,
    durationMs: 0,
    renderedBytes: null,
    error: null,
  };

  const context = await browser.newContext({
    viewport: { width: MOBILE_SCREEN.width, height: MOBILE_SCREEN.height },
    deviceScaleFactor: MOBILE_SCREEN.deviceScaleFactor,
    isMobile: MOBILE_SCREEN.isMobile,
    hasTouch: MOBILE_SCREEN.hasTouch,
    userAgent: deps.userAgent,
    ignoreHTTPSErrors: site.tlsInvalido,
    serviceWorkers: "block",
    recordHar: { path: join(dir, FILES.har), content: "embed", mode: "full" },
  });
  try {
    const page = await context.newPage();
    // Só o início da navegação passa pelo limitador (ADR 006, opção 4b).
    const response = await limiter.schedule(new URL(site.url).host, () =>
      page.goto(site.url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }),
    );
    result.domContentLoadedMs = ms();
    result.status = response?.status() ?? null;
    try {
      await page.waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS });
      result.networkidleMs = ms();
    } catch (err) {
      if (!(err instanceof Error && err.name === "TimeoutError")) throw err;
      result.networkidleTimeout = true;
    }
    result.finalUrl = page.url();
    const html = await page.content();
    writeFileSync(join(dir, FILES.rendered), html, "utf8");
    result.renderedBytes = Buffer.byteLength(html, "utf8");
    await page.screenshot({ path: join(dir, FILES.screenshot), fullPage: false });
    result.ok = true;
  } catch (err) {
    result.error = describeError(err);
  } finally {
    // Fechar o contexto é o que grava o HAR em disco.
    await context.close().catch((err: unknown) => {
      result.ok = false;
      result.error ??= `har: ${describeError(err)}`;
    });
    result.durationMs = ms();
  }
  return result;
}

// --------------------------------------------------------------------------
// Registro (`collect.json`)
// --------------------------------------------------------------------------

export interface CollectMeta {
  collectedAt: string;
  toolVersions: ToolVersions;
  gitCommit: string | null;
  gitDirty: boolean;
}

export interface CollectRecord {
  meta: CollectMeta;
  id: string;
  url: string;
  tlsInvalido: boolean;
  parametros: {
    userAgent: string;
    screen: typeof MOBILE_SCREEN;
    navTimeoutMs: number;
    networkidleTimeoutMs: number;
    rawTotalTimeoutMs: number;
  };
  raw: RawResult;
  /** `<meta http-equiv="refresh">` do HTML bruto; `null` se não houver. */
  metaRefresh: MetaRefresh | null;
  render: RenderResult;
  /** Quais arquivos existem na pasta ao fim da coleta. */
  arquivos: Record<keyof typeof FILES, boolean>;
  /** Todas as etapas ok e todos os arquivos presentes. */
  completo: boolean;
}

export function buildCollectRecord(params: {
  meta: CollectMeta;
  site: SiteToCollect;
  userAgent: string;
  raw: RawResult;
  metaRefresh?: MetaRefresh | null;
  render: RenderResult;
  arquivos: Omit<Record<keyof typeof FILES, boolean>, "record">;
}): CollectRecord {
  const arquivos = { ...params.arquivos, record: true };
  return {
    meta: params.meta,
    id: params.site.id,
    url: params.site.url,
    tlsInvalido: params.site.tlsInvalido,
    parametros: {
      userAgent: params.userAgent,
      screen: MOBILE_SCREEN,
      navTimeoutMs: NAV_TIMEOUT_MS,
      networkidleTimeoutMs: NETWORKIDLE_TIMEOUT_MS,
      rawTotalTimeoutMs: RAW_TOTAL_TIMEOUT_MS,
    },
    raw: params.raw,
    metaRefresh: params.metaRefresh ?? null,
    render: params.render,
    arquivos,
    completo: params.raw.ok && params.render.ok && Object.values(arquivos).every(Boolean),
  };
}

// --------------------------------------------------------------------------
// Orquestração de um site
// --------------------------------------------------------------------------

export interface CollectPageOptions extends CollectDeps {
  rawDir: string;
  browser: Browser;
  /** Meta sem o `collectedAt` (preenchido no início da coleta do site). */
  baseMeta: Omit<CollectMeta, "collectedAt">;
}

/**
 * Coleta um site e grava o `collect.json` por último (sua presença marca a
 * pasta como coletada). Não lança: falhas ficam registradas no record.
 */
export async function collectPage(site: SiteToCollect, options: CollectPageOptions): Promise<CollectRecord> {
  const dir = siteDir(options.rawDir, site.id);
  mkdirSync(dir, { recursive: true });
  const collectedAt = new Date().toISOString();

  const raw = await fetchRaw(site, join(dir, FILES.raw), options);
  // latin1 preserva cada byte: basta para achar a tag, qualquer que seja o charset.
  const metaRefresh = raw.ok
    ? detectMetaRefresh(readFileSync(join(dir, FILES.raw), "latin1"), raw.finalUrl ?? site.url)
    : null;
  const render = await renderPage(options.browser, site, dir, options);

  const has = (f: string) => existsSync(join(dir, f));
  const record = buildCollectRecord({
    meta: { collectedAt, ...options.baseMeta },
    site,
    userAgent: options.userAgent,
    raw,
    metaRefresh,
    render,
    arquivos: {
      raw: has(FILES.raw),
      rendered: has(FILES.rendered),
      screenshot: has(FILES.screenshot),
      har: has(FILES.har),
    },
  });
  writeFileSync(join(dir, FILES.record), JSON.stringify(record, null, 2) + "\n", "utf8");
  return record;
}
