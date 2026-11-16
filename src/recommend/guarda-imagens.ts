import { readFileSync } from "node:fs";

import type { Browser, BrowserContextOptions } from "playwright";

import { MOBILE_SCREEN } from "../collect/page.js";
import type { Recommendation } from "../shared/types.js";
import { aplicarEdicoes } from "./engine.js";

/**
 * Guarda de renderização das imagens (S18b, adendo ao ADR 014). A regra
 * `img-dimensions` acrescenta `width`/`height`; se o CSS da página fixa só uma
 * dimensão, o atributo passa a valer na outra e a imagem distorce (achado da
 * S18). Análise estática de CSS não é confiável (media queries, especificidade,
 * scripts), então a guarda MEDE: renderiza a página original e a corrigida a
 * partir do HAR da coleta (sem rede, regra 7), em viewport mobile e desktop, e
 * compara o tamanho exibido de cada imagem corrigida. Qualquer diferença, ou
 * medida impossível (imagem ausente, não carregada, instável entre duas
 * renderizações do original), desfaz a correção daquela imagem.
 * Princípio: sem prova de que o tamanho não muda, não corrige.
 */

export const REGRA_GUARDADA = "img-dimensions";
export const MARCADOR = "data-tcc-guarda";
/** Diferença tolerada, em px CSS (arredondamento de layout). */
export const TOLERANCIA_PX = 0.5;

export const VIEWPORTS: Record<string, BrowserContextOptions> = {
  mobile: {
    viewport: { width: MOBILE_SCREEN.width, height: MOBILE_SCREEN.height },
    deviceScaleFactor: MOBILE_SCREEN.deviceScaleFactor,
    isMobile: MOBILE_SCREEN.isMobile,
    hasTouch: MOBILE_SCREEN.hasTouch,
  },
  desktop: { viewport: { width: 1350, height: 940 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

// --------------------------------------------------------------------------
// Funções puras
// --------------------------------------------------------------------------

export interface Medicao {
  /** Marcador → tamanho de layout (`offsetWidth` × `offsetHeight`), ou `null` se o elemento não existe. */
  [marcador: string]: { largura: number; altura: number; carregada: boolean } | null;
}

/**
 * Os dois HTMLs de medição: o original e o corrigido, ambos com um marcador
 * (` data-tcc-guarda="k"`) na tag de cada imagem corrigida pela regra guardada.
 * O marcador só existe na medição; o `fixed.html` não o recebe.
 */
export function prepararMedicao(html: string, recs: readonly Recommendation[]): { original: string; corrigido: string; marcadores: Map<string, string> } {
  const marcadores = new Map<string, string>();
  const soMarcas = [];
  const corrigido = [];
  let k = 0;
  for (const r of recs) {
    if (r.regra !== REGRA_GUARDADA || r.edicoes.length === 0) {
      corrigido.push(...r.edicoes);
      continue;
    }
    const marca = ` ${MARCADOR}="${++k}"`;
    marcadores.set(String(k), r.id);
    const [primeira, ...resto] = r.edicoes;
    soMarcas.push({ inicio: primeira!.inicio, fim: primeira!.inicio, texto: marca });
    corrigido.push({ ...primeira!, texto: marca + primeira!.texto }, ...resto);
  }
  return { original: aplicarEdicoes(html, soMarcas), corrigido: aplicarEdicoes(html, corrigido), marcadores };
}

export type Veredito = "igual" | "mudou" | "instavel" | "nao-medida";

const igual = (a: { largura: number; altura: number }, b: { largura: number; altura: number }) =>
  Math.abs(a.largura - b.largura) <= TOLERANCIA_PX && Math.abs(a.altura - b.altura) <= TOLERANCIA_PX;

/**
 * Veredito de um marcador num viewport: `original1`/`original2` são duas
 * renderizações do original (ruído), `corrigido` a da página corrigida.
 */
export function veredito(m: string, original1: Medicao, original2: Medicao, corrigido: Medicao): Veredito {
  const [a, b, c] = [original1[m], original2[m], corrigido[m]];
  if (!a || !b || !c || !a.carregada || !b.carregada || !c.carregada) return "nao-medida";
  if (!igual(a, b)) return "instavel";
  return igual(a, c) ? "igual" : "mudou";
}

export interface ResultadoGuarda {
  /** Marcador → recomendação, viewport → veredito e medidas. */
  imagens: Array<{
    recomendacao: string;
    vereditos: Record<string, Veredito>;
    medidas: Record<string, { original: Medicao[string]; corrigido: Medicao[string] }>;
    mantida: boolean;
  }>;
  mantidas: number;
  desfeitas: number;
  erro: string | null;
}

/** Junta as medições por viewport; uma imagem é mantida só se for `igual` em todos. */
export function julgar(marcadores: Map<string, string>, porViewport: Record<string, { o1: Medicao; o2: Medicao; c: Medicao }>): ResultadoGuarda {
  const imagens = [...marcadores].map(([m, recomendacao]) => {
    const vereditos: Record<string, Veredito> = {};
    const medidas: ResultadoGuarda["imagens"][number]["medidas"] = {};
    for (const [vp, x] of Object.entries(porViewport)) {
      vereditos[vp] = veredito(m, x.o1, x.o2, x.c);
      medidas[vp] = { original: x.o1[m] ?? null, corrigido: x.c[m] ?? null };
    }
    const mantida = Object.keys(porViewport).length > 0 && Object.values(vereditos).every((v) => v === "igual");
    return { recomendacao, vereditos, medidas, mantida };
  });
  const mantidas = imagens.filter((i) => i.mantida).length;
  return { imagens, mantidas, desfeitas: imagens.length - mantidas, erro: null };
}

/** Recomendações com as correções reprovadas desfeitas (viram só recomendação, com o motivo). */
export function desfazerReprovadas(recs: readonly Recommendation[], g: ResultadoGuarda): Recommendation[] {
  const reprovadas = new Map(g.imagens.filter((i) => !i.mantida).map((i) => [i.recomendacao, i.vereditos]));
  return recs.map((r) => {
    const v = reprovadas.get(r.id);
    if (v === undefined) return r;
    const detalhe = Object.entries(v).map(([vp, x]) => `${vp}: ${x}`).join(", ");
    return {
      ...r,
      correcaoAutomatica: false,
      edicoes: [],
      mensagem: `${r.mensagem} (correção não aplicada: a guarda de renderização não comprovou que o tamanho exibido da imagem fica igual; ${detalhe})`,
    };
  });
}

// --------------------------------------------------------------------------
// Renderização (Playwright + HAR)
// --------------------------------------------------------------------------

export interface FonteRender {
  harPath: string;
  /** URL do documento principal (a do HAR). */
  url: string;
  contentType: string;
}

/**
 * URLs que o HAR responde de fato (status > 0). Entradas de requisições que
 * falharam na coleta (status −1, ex.: `ERR_BLOCKED_BY_ORB`) deixam o
 * `routeFromHAR` pendurado; elas são abortadas antes, como falharam na coleta.
 */
export function urlsRespondidas(har: { log: { entries: Array<{ request: { url: string }; response: { status: number } }> } }): Set<string> {
  return new Set(har.log.entries.filter((e) => e.response.status > 0).map((e) => e.request.url));
}

/** Tamanhos de layout das imagens marcadas, com o documento principal trocado por `corpo` e o resto do HAR. */
export async function medir(browser: Browser, f: FonteRender, corpo: Buffer, opcoes: BrowserContextOptions, respondidas: Set<string>): Promise<Medicao> {
  const context = await browser.newContext({ ...opcoes, serviceWorkers: "block" });
  try {
    await context.routeFromHAR(f.harPath, { notFound: "abort" });
    // Registrada depois do HAR, tem precedência (Playwright: ordem inversa).
    await context.route("**/*", (route) => {
      const req = route.request();
      if (req.isNavigationRequest() && req.frame().parentFrame() === null) return route.fulfill({ status: 200, contentType: f.contentType, body: corpo });
      return respondidas.has(req.url()) ? route.fallback() : route.abort();
    });
    const page = await context.newPage();
    // Não depende do evento `load` (um recurso preso o seguraria): cada imagem só é
    // julgada se tiver carregado (`carregada`), então esperar menos não afrouxa a guarda.
    await page.goto(f.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => undefined);
    // Imagens com carregamento tardio fora da tela não carregariam e ficariam sem medida:
    // na medição (igual nas duas variantes), todas passam a carregar já; espera até 8 s.
    await page.evaluate(`document.querySelectorAll("img[loading]").forEach((i) => { i.loading = "eager"; })`);
    await page
      .waitForFunction(`Array.from(document.querySelectorAll("[${MARCADOR}]")).every((i) => i.complete)`, undefined, { timeout: 8000 })
      .catch(() => undefined);
    await page.waitForTimeout(500);
    // Texto, e não função: o tsconfig não inclui os tipos do DOM (e o tsx envolveria a função em `__name`).
    return (await page.evaluate(`(() => {
      const out = {};
      for (const img of document.querySelectorAll("[${MARCADOR}]")) {
        out[img.getAttribute("${MARCADOR}")] = { largura: img.offsetWidth, altura: img.offsetHeight, carregada: img.complete && img.naturalWidth > 0 };
      }
      return out;
    })()`)) as Medicao;
  } finally {
    await context.close();
  }
}

/**
 * Roda a guarda. `codificar` converte o HTML de medição em bytes na
 * codificação original da página. Erro na renderização → todas as correções
 * guardadas são desfeitas (sem prova, não corrige).
 */
export async function guardarImagens(
  browser: Browser,
  f: FonteRender,
  html: string,
  recs: readonly Recommendation[],
  codificar: (texto: string) => Buffer,
): Promise<ResultadoGuarda> {
  const { original, corrigido, marcadores } = prepararMedicao(html, recs);
  if (marcadores.size === 0) return { imagens: [], mantidas: 0, desfeitas: 0, erro: null };
  try {
    const respondidas = urlsRespondidas(JSON.parse(readFileSync(f.harPath, "utf8")));
    const porViewport: Record<string, { o1: Medicao; o2: Medicao; c: Medicao }> = {};
    for (const [nome, vp] of Object.entries(VIEWPORTS)) {
      porViewport[nome] = {
        o1: await medir(browser, f, codificar(original), vp, respondidas),
        c: await medir(browser, f, codificar(corrigido), vp, respondidas),
        o2: await medir(browser, f, codificar(original), vp, respondidas),
      };
    }
    return julgar(marcadores, porViewport);
  } catch (e) {
    const g = julgar(marcadores, {});
    return { ...g, erro: (e as Error).message };
  }
}
