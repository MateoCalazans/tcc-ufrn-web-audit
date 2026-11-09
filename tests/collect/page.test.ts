import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  alreadyCollected,
  buildCollectRecord,
  collectPage,
  describeError,
  detectMetaRefresh,
  FILES,
  MOBILE_SCREEN,
  type RawResult,
  type RenderResult,
  sitesFromCorpus,
} from "../../src/collect/page.js";
import { HostLimiter } from "../../src/shared/http.js";

const FIXTURE = readFileSync(join("tests", "fixtures", "collect", "js-insere.html"));
const FIXTURE_REFRESH = readFileSync(join("tests", "fixtures", "collect", "meta-refresh.html"));
const UA = "TCC-EAJ-UFRN-Audit/0.0.0-test (+teste@example.org)";

describe("detectMetaRefresh", () => {
  const base = "https://a.ufrn.br/pasta/";

  it("caso do acervus: atraso 0 e URL absoluta", () => {
    const html = '<meta http-equiv="refresh" content="0;url=https://acervus.ufrn.br/acervus-publico">';
    expect(detectMetaRefresh(html, base)).toEqual({
      conteudo: "0;url=https://acervus.ufrn.br/acervus-publico",
      atrasoS: 0,
      destino: "https://acervus.ufrn.br/acervus-publico",
    });
  });

  it("resolve destino relativo, aceita maiúsculas, aspas no URL e atributos em outra ordem", () => {
    const html = "<META CONTENT=\"5; URL='novo/index.php'\" HTTP-EQUIV=Refresh>";
    expect(detectMetaRefresh(html, base)).toEqual({
      conteudo: "5; URL='novo/index.php'",
      atrasoS: 5,
      destino: "https://a.ufrn.br/pasta/novo/index.php",
    });
  });

  it("aceita destino sem 'url=' e refresh sem destino", () => {
    expect(detectMetaRefresh('<meta http-equiv="refresh" content="0; /inicio">', base)?.destino).toBe(
      "https://a.ufrn.br/inicio",
    );
    expect(detectMetaRefresh('<meta http-equiv="refresh" content="300">', base)).toEqual({
      conteudo: "300",
      atrasoS: 300,
      destino: null,
    });
  });

  it("ignora tags comentadas e outras metas; null quando não há refresh", () => {
    expect(detectMetaRefresh(FIXTURE_REFRESH.toString("utf8"), base)?.destino).toBe("https://a.ufrn.br/");
    expect(detectMetaRefresh('<meta charset="utf-8"><meta name="refresh" content="0;url=/x">', base)).toBeNull();
    expect(detectMetaRefresh(FIXTURE.toString("utf8"), base)).toBeNull();
  });
});

describe("MOBILE_SCREEN", () => {
  it("é a mesma emulação de tela do Lighthouse mobile (ADR 006)", async () => {
    const lh = (await import("lighthouse/core/config/constants.js")) as {
      screenEmulationMetrics: { mobile: { width: number; height: number; deviceScaleFactor: number; mobile: boolean } };
    };
    const m = lh.screenEmulationMetrics.mobile;
    expect(MOBILE_SCREEN.width).toBe(m.width);
    expect(MOBILE_SCREEN.height).toBe(m.height);
    expect(MOBILE_SCREEN.deviceScaleFactor).toBe(m.deviceScaleFactor);
    expect(MOBILE_SCREEN.isMobile).toBe(m.mobile);
  });
});

describe("sitesFromCorpus", () => {
  const rows = [
    { id: "a.ufrn.br", incluido: "true", url_final: "https://a.ufrn.br/inicio", tls_invalido: "" },
    { id: "b.ufrn.br", incluido: "false", url_final: "", tls_invalido: "" },
    // Formato real do corpus.csv: a causa do problema de certificado, ou vazio.
    { id: "c.ufrn.br", incluido: "true", url_final: "", tls_invalido: "cert-cadeia-incompleta" },
    { id: "d.ufrn.br", incluido: "true", url_final: "http://d.ufrn.br/", tls_invalido: "" },
  ];

  it("mantém só incluídos, na ordem, com url_final e tls_invalido", () => {
    expect(sitesFromCorpus(rows)).toEqual([
      { id: "a.ufrn.br", url: "https://a.ufrn.br/inicio", tlsInvalido: false },
      { id: "c.ufrn.br", url: "https://c.ufrn.br/", tlsInvalido: true },
      { id: "d.ufrn.br", url: "http://d.ufrn.br/", tlsInvalido: false },
    ]);
  });

  it("aplica --limit e --site", () => {
    expect(sitesFromCorpus(rows, { limit: 2 }).map((s) => s.id)).toEqual(["a.ufrn.br", "c.ufrn.br"]);
    expect(sitesFromCorpus(rows, { site: "d.ufrn.br" }).map((s) => s.id)).toEqual(["d.ufrn.br"]);
    expect(sitesFromCorpus(rows, { site: "b.ufrn.br" })).toEqual([]);
  });
});

describe("describeError", () => {
  it("inclui o code da causa (undici) e só a 1ª linha da mensagem", () => {
    const err = new TypeError("fetch failed\ndetalhes", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
    expect(describeError(err)).toBe("TypeError: fetch failed (UND_ERR_CONNECT_TIMEOUT)");
    expect(describeError("x")).toBe("x");
  });
});

describe("buildCollectRecord", () => {
  const meta = { collectedAt: "2026-11-09T00:00:00.000Z", toolVersions: { node: "x", lighthouse: null, playwright: null }, gitCommit: null, gitDirty: true };
  const site = { id: "a.ufrn.br", url: "https://a.ufrn.br/", tlsInvalido: false };
  const raw: RawResult = { ok: true, finalUrl: site.url, status: 200, headers: {}, bytes: 10, startedAt: "", durationMs: 1, error: null };
  const render: RenderResult = {
    ok: true, finalUrl: site.url, status: 200, networkidleTimeout: false, startedAt: "",
    domContentLoadedMs: 1, networkidleMs: 2, durationMs: 3, renderedBytes: 10, error: null,
  };
  const todos = { raw: true, rendered: true, screenshot: true, har: true };

  it("completo só com as duas etapas ok e todos os arquivos", () => {
    expect(buildCollectRecord({ meta, site, userAgent: UA, raw, render, arquivos: todos }).completo).toBe(true);
    expect(buildCollectRecord({ meta, site, userAgent: UA, raw, render, arquivos: { ...todos, har: false } }).completo).toBe(false);
    expect(buildCollectRecord({ meta, site, userAgent: UA, raw: { ...raw, ok: false }, render, arquivos: todos }).completo).toBe(false);
  });

  it("networkidle-timeout não torna o registro incompleto (ADR 006)", () => {
    const r = buildCollectRecord({ meta, site, userAgent: UA, raw, render: { ...render, networkidleTimeout: true }, arquivos: todos });
    expect(r.completo).toBe(true);
    expect(r.parametros.screen).toEqual(MOBILE_SCREEN);
  });
});

describe("collectPage (servidor local + Chromium)", () => {
  let server: Server;
  let browser: Browser;
  let base: string;
  let rawDir: string;
  const userAgents: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      userAgents.push(req.headers["user-agent"] ?? "");
      if (req.url === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(FIXTURE);
      } else if (req.url === "/refresh") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(FIXTURE_REFRESH);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    browser = await chromium.launch();
    rawDir = mkdtempSync(join(tmpdir(), "collect-test-"));
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((r) => server?.close(r));
    rmSync(rawDir, { recursive: true, force: true });
  });

  it("grava os 5 arquivos; bruto sem o conteúdo JS, renderizado com ele", async () => {
    const site = { id: "local.test", url: base, tlsInvalido: false };
    const baseMeta = { toolVersions: { node: "x", lighthouse: null, playwright: null }, gitCommit: null, gitDirty: true };
    const r = await collectPage(site, {
      rawDir,
      browser,
      userAgent: UA,
      baseMeta,
      limiter: new HostLimiter({ minIntervalMs: 0 }),
    });

    expect(r.raw.error).toBeNull();
    expect(r.render.error).toBeNull();
    expect(r.completo).toBe(true);
    expect(r.raw.status).toBe(200);
    expect(r.render.status).toBe(200);
    expect(r.render.networkidleTimeout).toBe(false);
    expect(r.metaRefresh).toBeNull();

    const dir = join(rawDir, site.id);
    for (const f of Object.values(FILES)) expect(existsSync(join(dir, f)), f).toBe(true);
    expect(alreadyCollected(rawDir, site.id)).toBe(true);

    // index.html: bytes idênticos ao servido.
    expect(readFileSync(join(dir, FILES.raw)).equals(FIXTURE)).toBe(true);
    expect(readFileSync(join(dir, FILES.raw), "utf8")).not.toContain('id="inserido-por-js"');
    expect(readFileSync(join(dir, FILES.rendered), "utf8")).toContain('id="inserido-por-js"');

    // Screenshot só da viewport: 412×823 CSS px × DPR 1,75 = 721×1440 px.
    const png = readFileSync(join(dir, FILES.screenshot));
    expect(png.readUInt32BE(16)).toBe(Math.round(412 * 1.75));
    expect(png.readUInt32BE(20)).toBe(Math.round(823 * 1.75));

    const har = JSON.parse(readFileSync(join(dir, FILES.har), "utf8")) as { log: { entries: unknown[] } };
    expect(har.log.entries.length).toBeGreaterThan(0);

    const record = JSON.parse(readFileSync(join(dir, FILES.record), "utf8")) as { meta: { collectedAt: string } };
    expect(record.meta.collectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Regra 2: toda requisição (bruta e do navegador) com o User-Agent identificado.
    expect(userAgents.length).toBeGreaterThanOrEqual(2);
    expect(new Set(userAgents)).toEqual(new Set([UA]));
  }, 60_000);

  it("meta refresh: registra o destino; o bruto é o stub e o renderizado é o destino", async () => {
    const site = { id: "refresh.test", url: `${base}refresh`, tlsInvalido: false };
    const baseMeta = { toolVersions: { node: "x", lighthouse: null, playwright: null }, gitCommit: null, gitDirty: true };
    const r = await collectPage(site, {
      rawDir,
      browser,
      userAgent: UA,
      baseMeta,
      limiter: new HostLimiter({ minIntervalMs: 0 }),
    });

    expect(r.completo).toBe(true);
    expect(r.metaRefresh).toEqual({ conteudo: "0;url=/", atrasoS: 0, destino: base });
    expect(r.raw.finalUrl).toBe(site.url);
    expect(r.render.finalUrl).toBe(base);
    const dir = join(rawDir, site.id);
    expect(readFileSync(join(dir, FILES.raw)).equals(FIXTURE_REFRESH)).toBe(true);
    expect(readFileSync(join(dir, FILES.rendered), "utf8")).toContain('id="inserido-por-js"');
  }, 60_000);
});
