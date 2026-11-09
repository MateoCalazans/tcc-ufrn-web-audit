import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Result } from "lighthouse";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  alreadyMeasured,
  buildLighthouseRecord,
  CATEGORIES,
  chromeFlags,
  chromeVersionFrom,
  collectLighthouse,
  LH_RECORD,
  lhRunFile,
  lighthouseFlags,
  type LighthouseRunner,
  medianRunByFcpTti,
  medianRunByScore,
  type RunSummary,
  summarizeRun,
  variacao,
} from "../../src/collect/lighthouse.js";
import { HostLimiter } from "../../src/shared/http.js";

const UA = "TCC-EAJ-UFRN-Audit/0.0.0-test (+teste@example.org)";
const LHR_TXT = readFileSync(join("tests", "fixtures", "collect", "lhr-reduzido.json"), "utf8");
const FIXTURE_HTML = readFileSync(join("tests", "fixtures", "collect", "js-insere.html"));
const site = { id: "exemplo.ufrn.br", url: "https://exemplo.ufrn.br/", tlsInvalido: false };
const baseMeta = { toolVersions: { node: "x", lighthouse: "13.5.0", playwright: "1.64.1" }, gitCommit: null, gitDirty: true };

/** LHR da fixture com nota de performance, FCP e TTI trocados. */
function lhr(perf: number | null, fcp = 2500, tti = 9000): Result {
  const r = JSON.parse(LHR_TXT) as Result;
  r.categories.performance!.score = perf;
  r.audits["first-contentful-paint"]!.numericValue = fcp;
  r.audits.interactive!.numericValue = tti;
  return r;
}

const run = (n: number, perf: number | null, extra: Partial<RunSummary> = {}): RunSummary => ({
  ...summarizeRun(n, "2026-11-09T00:00:00.000Z", 1000, { lhr: lhr(perf === null ? null : perf / 100) }),
  ...extra,
});

describe("parâmetros (ADR 007)", () => {
  it("flags do Chrome: --ignore-certificate-errors só com tls_invalido", () => {
    expect(chromeFlags({ tlsInvalido: false }, UA)).not.toContain("--ignore-certificate-errors");
    expect(chromeFlags({ tlsInvalido: true }, UA)).toContain("--ignore-certificate-errors");
    expect(chromeFlags({ tlsInvalido: false }, UA)).toContain("--headless");
  });

  it("flags do Chrome: nosso User-Agent no navegador inteiro (regra 2, robots.txt)", () => {
    expect(chromeFlags({ tlsInvalido: false }, UA)).toContain(`--user-agent=${UA}`);
  });

  it("Lighthouse: mobile, simulate, 4 categorias e nosso User-Agent (regra 2)", () => {
    const f = lighthouseFlags(UA, 9222);
    expect(f).toMatchObject({ port: 9222, formFactor: "mobile", throttlingMethod: "simulate", emulatedUserAgent: UA });
    expect(f.onlyCategories).toEqual(["performance", "accessibility", "best-practices", "seo"]);
  });
});

describe("summarizeRun", () => {
  it("converte notas para 0–100 e lê versão, User-Agent do host e URLs", () => {
    const s = summarizeRun(1, "t", 10, { lhr: lhr(0.57) });
    expect(s.valida).toBe(true);
    expect(s.notas).toEqual({ performance: 57, accessibility: 81, "best-practices": 96, seo: 83 });
    expect(s.lighthouseVersion).toBe("13.5.0");
    expect(chromeVersionFrom("HeadlessChrome/156.0.8078.4")).toBe("156.0.8078.4");
    expect(summarizeRun(1, "t", 10, { lhr: lhr(0.5), browserVersion: "156.0.8078.4" }).browserVersion).toBe("156.0.8078.4");
    expect(s.finalDisplayedUrl).toBe("https://exemplo.ufrn.br/");
  });

  it("runtimeError ou nota ausente tornam a execução inválida; exceção vira `erro`", () => {
    const comErro = lhr(null);
    comErro.runtimeError = { code: "NO_FCP", message: "The page did not paint any content." };
    const s = summarizeRun(2, "t", 10, { lhr: comErro });
    expect(s.valida).toBe(false);
    expect(s.runtimeError?.code).toBe("NO_FCP");
    expect(s.notas.performance).toBeNull();

    const e = summarizeRun(3, "t", 10, { erro: "Error: ECONNREFUSED" });
    expect(e).toMatchObject({ valida: false, erro: "Error: ECONNREFUSED", lighthouseVersion: null });
  });
});

describe("medianRunByScore", () => {
  it("pega a execução do meio pela nota de performance", () => {
    expect(medianRunByScore([run(1, 70), run(2, 50), run(3, 60)])).toBe(3);
    expect(medianRunByScore([run(1, 40), run(2, 90), run(3, 60)])).toBe(3);
  });

  it("empate fica com a execução mais antiga", () => {
    expect(medianRunByScore([run(1, 60), run(2, 60), run(3, 60)])).toBe(2);
    expect(medianRunByScore([run(1, 55), run(2, 60), run(3, 60)])).toBe(2);
  });

  it("ignora inválidas; com 2 válidas fica a de menor nota; sem válidas, null", () => {
    expect(medianRunByScore([run(1, 80), run(2, null), run(3, 60)])).toBe(3);
    expect(medianRunByScore([run(1, 80, { valida: false }), run(2, 50), run(3, 60)])).toBe(2);
    expect(medianRunByScore([run(1, null), run(2, null)])).toBeNull();
  });
});

describe("medianRunByFcpTti", () => {
  it("devolve a execução que o computeMedianRun do Lighthouse escolhe", () => {
    const lhrs = [
      { n: 1, lhr: lhr(0.5, 1000, 5000) },
      { n: 2, lhr: lhr(0.9, 3000, 9000) },
      { n: 3, lhr: lhr(0.7, 2000, 7000) },
    ];
    expect(medianRunByFcpTti(lhrs)).toBe(3);
    expect(medianRunByFcpTti([])).toBeNull();
  });
});

describe("variacao", () => {
  it("min, max, amplitude, média e desvio-padrão amostral", () => {
    expect(variacao([50, 60, 70])).toEqual({ n: 3, min: 50, max: 70, amplitude: 20, media: 60, desvioPadrao: 10 });
    expect(variacao([57, 57, 57]).desvioPadrao).toBe(0);
  });

  it("ignora nulos; com 1 nota não há desvio; vazio dá nulos", () => {
    expect(variacao([80, null])).toMatchObject({ n: 1, amplitude: 0, desvioPadrao: null });
    expect(variacao([])).toMatchObject({ n: 0, media: null, desvioPadrao: null });
  });
});

describe("buildLighthouseRecord", () => {
  const meta = { collectedAt: "t", ...baseMeta };

  it("completo só com 3 execuções válidas e 3 arquivos", () => {
    const runs = [run(1, 70), run(2, 50), run(3, 60)];
    const r = buildLighthouseRecord({ meta, site, userAgent: UA, runs, nFcpTti: 3, arquivosGravados: 3 });
    expect(r.completo).toBe(true);
    expect(r.mediana).toMatchObject({ criterio: "nota-performance", n: 3, nFcpTti: 3 });
    expect(r.mediana.notas?.performance).toBe(60);
    expect(r.variacaoPerformance.amplitude).toBe(20);
    expect(r.parametros.categorias).toEqual(CATEGORIES);

    const umaInvalida = [run(1, 70), run(2, null), run(3, 60)];
    expect(buildLighthouseRecord({ meta, site, userAgent: UA, runs: umaInvalida, nFcpTti: null, arquivosGravados: 3 }).completo).toBe(false);
    expect(buildLighthouseRecord({ meta, site, userAgent: UA, runs, nFcpTti: 3, arquivosGravados: 2 }).completo).toBe(false);
  });
});

describe("collectLighthouse (runner falso)", () => {
  let rawDir: string;
  beforeAll(() => {
    rawDir = mkdtempSync(join(tmpdir(), "lh-test-"));
  });
  afterAll(() => rmSync(rawDir, { recursive: true, force: true }));

  it("grava lh1..lh3 e lighthouse.json; falha numa execução não derruba as outras", async () => {
    const notas = [0.7, null, 0.6];
    const chamadas: Array<{ url: string; ua: string; tls: boolean }> = [];
    let i = 0;
    const runner: LighthouseRunner = async (url, o) => {
      chamadas.push({ url, ua: o.userAgent, tls: o.tlsInvalido });
      const p = notas[i++];
      if (p === null) throw new Error("chrome caiu");
      const r = lhr(p ?? 0);
      return { lhr: r, json: JSON.stringify(r), browserVersion: "156.0.8078.4" };
    };
    const s = { ...site, tlsInvalido: true };
    const rec = await collectLighthouse(s, {
      rawDir,
      userAgent: UA,
      chromePath: "x",
      baseMeta,
      limiter: new HostLimiter({ minIntervalMs: 0 }),
      runner,
    });

    expect(chamadas).toHaveLength(3);
    expect(chamadas.every((c) => c.ua === UA && c.tls && c.url === s.url)).toBe(true);
    const dir = join(rawDir, s.id);
    expect(existsSync(join(dir, lhRunFile(1)))).toBe(true);
    expect(existsSync(join(dir, lhRunFile(2)))).toBe(false);
    expect(existsSync(join(dir, lhRunFile(3)))).toBe(true);
    expect(rec.execucoes[1]).toMatchObject({ n: 2, valida: false, erro: "Error: chrome caiu" });
    expect(rec.completo).toBe(false);
    expect(rec.mediana.n).toBe(3); // 2 válidas (70, 60): fica a de menor nota
    expect(rec.meta.toolVersions.chromium).toBe("156.0.8078.4");
    expect(rec.parametros.chromeFlags).toContain("--ignore-certificate-errors");

    const gravado = JSON.parse(readFileSync(join(dir, LH_RECORD), "utf8")) as { id: string };
    expect(gravado.id).toBe(s.id);
    expect(alreadyMeasured(rawDir, s.id)).toBe(true);
  });

  it("execuções passam pelo limitador do host, em sequência", async () => {
    const inicios: number[] = [];
    const limiter = new HostLimiter({ minIntervalMs: 50 });
    const runner: LighthouseRunner = async () => {
      inicios.push(Date.now());
      const r = lhr(0.5);
      return { lhr: r, json: "{}", browserVersion: null };
    };
    const s = { ...site, id: "limitador.ufrn.br" };
    await collectLighthouse(s, { rawDir, userAgent: UA, chromePath: "x", baseMeta, limiter, runner });
    expect(inicios).toHaveLength(3);
    for (let k = 1; k < inicios.length; k++) expect(inicios[k]! - inicios[k - 1]!).toBeGreaterThanOrEqual(45);
  });
});

describe("collectLighthouse (Lighthouse real, servidor local)", () => {
  let server: Server;
  let base: string;
  let rawDir: string;
  const userAgents: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      userAgents.push(req.headers["user-agent"] ?? "");
      if (req.url === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(FIXTURE_HTML);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    rawDir = mkdtempSync(join(tmpdir(), "lh-real-"));
  });

  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    rmSync(rawDir, { recursive: true, force: true });
  });

  it("1 execução: relatório válido, 4 notas, nosso User-Agent no servidor", async () => {
    const s = { id: "local.test", url: base, tlsInvalido: false };
    const rec = await collectLighthouse(s, {
      rawDir,
      userAgent: UA,
      chromePath: chromium.executablePath(),
      baseMeta,
      limiter: new HostLimiter({ minIntervalMs: 0 }),
      runs: 1,
    });
    expect(rec.execucoes[0]?.erro).toBeNull();
    expect(rec.execucoes[0]?.runtimeError).toBeNull();
    expect(rec.completo).toBe(true);
    for (const c of CATEGORIES) expect(rec.execucoes[0]?.notas[c], c).toEqual(expect.any(Number));
    // Versão exata (não a reduzida do User-Agent, `156.0.0.0`).
    expect(rec.meta.toolVersions.chromium).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(rec.meta.toolVersions.chromium).not.toMatch(/\.0\.0\.0$/);
    // Todas as requisições ao servidor usaram o nosso User-Agent (regra 2).
    expect(userAgents.length).toBeGreaterThan(0);
    expect(new Set(userAgents)).toEqual(new Set([UA]));

    const lh1 = JSON.parse(readFileSync(join(rawDir, s.id, lhRunFile(1)), "utf8")) as Result;
    expect(lh1.configSettings.formFactor).toBe("mobile");
    expect(lh1.configSettings.throttlingMethod).toBe("simulate");
    expect(lh1.environment.networkUserAgent).toBe(UA);
  }, 120_000);
});
