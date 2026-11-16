import type { Browser, Page } from "playwright";

import { MOBILE_SCREEN, NAV_TIMEOUT_MS, NETWORKIDLE_TIMEOUT_MS } from "../collect/page.js";
import { type Comparacao, compararPng } from "./compare.js";
import { servirSnapshot } from "./server.js";

/**
 * Verificação visual da cópia local (S17, ADR 018): a variante original,
 * servida pelo servidor local, é fotografada com os mesmos parâmetros da
 * coleta (viewport mobile, `networkidle`, só a viewport) e comparada pixel a
 * pixel com o `screenshot.png` da coleta. O ruído é medido entre duas
 * capturas locais seguidas.
 */

/**
 * Flag do Chromium que impede qualquer acesso à rede fora do servidor local
 * (regra 7: nada vai aos sites ao vivo). O que a cópia não trouxe falha em vez
 * de ser buscado. Usar também no Lighthouse da S18.
 */
export const BLOQUEIO_DE_REDE = "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1";

export interface Captura {
  png: Buffer;
  networkidleTimeout: boolean;
  /** Requisições a outro host que não o servidor local (URL não reescrita, ex.: montada em JS). */
  externas: string[];
  /** Requisições que falharam no navegador (inclui as externas bloqueadas). */
  falhas: string[];
}

/**
 * `relogio`: instante em que `Date.now()`/`new Date()` ficam fixos (os timers
 * continuam correndo). Na verificação, é o início da renderização na coleta:
 * páginas que montam o conteúdo pela data (ex.: agenda do dia) mostram o mesmo dia.
 */
export async function capturar(browser: Browser, url: string, userAgent: string, relogio?: Date): Promise<Captura> {
  const context = await browser.newContext({
    viewport: { width: MOBILE_SCREEN.width, height: MOBILE_SCREEN.height },
    deviceScaleFactor: MOBILE_SCREEN.deviceScaleFactor,
    isMobile: MOBILE_SCREEN.isMobile,
    hasTouch: MOBILE_SCREEN.hasTouch,
    userAgent,
    serviceWorkers: "block",
  });
  const local = new URL(url).host;
  const externas = new Set<string>();
  const falhas = new Set<string>();
  try {
    const page = await context.newPage();
    if (relogio) await page.clock.setFixedTime(relogio);
    page.on("request", (r) => {
      const u = r.url();
      if (/^https?:/.test(u) && new URL(u).host !== local) externas.add(u);
    });
    page.on("requestfailed", (r) => falhas.add(r.url()));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    let networkidleTimeout = false;
    try {
      await page.waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS });
    } catch (err) {
      if (!(err instanceof Error && err.name === "TimeoutError")) throw err;
      networkidleTimeout = true;
    }
    const png = await page.screenshot({ fullPage: false });
    return { png, networkidleTimeout, externas: [...externas], falhas: [...falhas] };
  } finally {
    await context.close();
  }
}

export interface Verificacao {
  urlLocal: string;
  /** Relógio fixado no navegador (início da renderização na coleta), ou `null`. */
  relogio: string | null;
  coletaLocal: Comparacao;
  ruido: Comparacao;
  /** `true` se a diferença coleta × local passa do ruído local × local. */
  acimaDoRuido: boolean | null;
  networkidleTimeout: boolean;
  faltasNoServidor: string[];
  servidasSemQuery: string[];
  externasBloqueadas: string[];
  falhasNoNavegador: string[];
}

export function acimaDoRuido(coletaLocal: Comparacao, ruido: Comparacao): boolean | null {
  if (coletaLocal.proporcao === null) return true; // tamanho diferente já é diferença
  if (ruido.proporcao === null) return null;
  return coletaLocal.proporcao > ruido.proporcao;
}

export async function verificarSnapshot(
  browser: Browser,
  comparador: Page,
  dirSnapshot: string,
  screenshotColeta: Buffer,
  userAgent: string,
  relogio: Date | null,
): Promise<{ verificacao: Verificacao; png: Buffer }> {
  const srv = await servirSnapshot(dirSnapshot, "original");
  try {
    const a = await capturar(browser, srv.urlPagina, userAgent, relogio ?? undefined);
    const b = await capturar(browser, srv.urlPagina, userAgent, relogio ?? undefined);
    const coletaLocal = await compararPng(comparador, screenshotColeta, a.png);
    const ruido = await compararPng(comparador, a.png, b.png);
    const uniao = (x: string[], y: string[]) => [...new Set([...x, ...y])];
    return {
      png: a.png,
      verificacao: {
        urlLocal: srv.urlPagina,
        relogio: relogio?.toISOString() ?? null,
        coletaLocal,
        ruido,
        acimaDoRuido: acimaDoRuido(coletaLocal, ruido),
        networkidleTimeout: a.networkidleTimeout || b.networkidleTimeout,
        faltasNoServidor: [...new Set(srv.faltas)],
        servidasSemQuery: [...new Set(srv.aproximadas)],
        externasBloqueadas: uniao(a.externas, b.externas),
        falhasNoNavegador: uniao(a.falhas, b.falhas),
      },
    };
  } finally {
    await srv.fechar();
  }
}
