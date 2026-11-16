import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { indicePorCaminho, resolver, servirSnapshot } from "../../src/validate/server.js";
import { gravarSnapshot, type Manifesto } from "../../src/validate/snapshot.js";
import { acimaDoRuido } from "../../src/validate/verify.js";

const FIX = join("tests", "fixtures", "validate");
const META = { generatedAt: "2026-11-16T00:00:00.000Z", toolVersions: { node: "x", lighthouse: null, playwright: null }, gitCommit: null, gitDirty: false };

let tmp: string;
let m: Manifesto;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "servidor-"));
  copyFileSync(join(FIX, "processed", "fixed.html"), join(tmp, "fixed.html"));
  m = gravarSnapshot({ siteId: "exemplo.ufrn.br", dirRaw: join(FIX, "raw", "exemplo.ufrn.br"), dirProcessado: tmp, meta: META });
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("resolver", () => {
  const pagina = Buffer.from("PAGINA");
  const ler = (n: string) => Buffer.from(`arquivo:${n}`);
  const r = (url: string) => resolver(m, indicePorCaminho(m.entradas), url, pagina, ler);

  it("a página sai do HTML da variante, com o Content-Type da coleta", () => {
    expect(r("/portal/")).toMatchObject({ status: 200, corpo: pagina, correspondencia: "pagina", headers: { "content-type": "text/html; charset=iso-8859-1" } });
    expect(r("/portal/?utm=x").correspondencia).toBe("pagina");
  });
  it("URL exata do manifesto", () => {
    const x = r("/_ext/cdn.exemplo.com/lib.js?v=2");
    expect(x).toMatchObject({ status: 200, correspondencia: "exata" });
    expect(x.headers["cache-control"]).toBe("no-store");
  });
  it("redirecionamento com Location local e sem corpo", () => {
    expect(r("/")).toMatchObject({ status: 301, corpo: null, headers: { location: "/portal/" } });
  });
  it("query diferente, caminho com uma só entrada: serve e marca sem-query", () => {
    expect(r("/_ext/cdn.exemplo.com/lib.js?v=3").correspondencia).toBe("sem-query");
  });
  it("/_ext/<host> sem barra final equivale a /_ext/<host>/", () => {
    expect(r("/_ext/cdn.exemplo.com").correspondencia).toBe("falta");
  });
  it("fora do manifesto: 404 e falta", () => {
    expect(r("/nao/existe.js")).toMatchObject({ status: 404, corpo: null, correspondencia: "falta" });
  });
});

describe("servirSnapshot", () => {
  it("serve as duas variantes em portas diferentes, com os mesmos recursos", async () => {
    const a = await servirSnapshot(join(tmp, "snapshot"), "original");
    const b = await servirSnapshot(join(tmp, "snapshot"), "corrigido");
    try {
      expect(a.porta).not.toBe(b.porta);
      const pa = Buffer.from(await (await fetch(a.urlPagina)).arrayBuffer()).toString("latin1");
      const pb = Buffer.from(await (await fetch(b.urlPagina)).arrayBuffer()).toString("latin1");
      expect(pa).not.toContain(`lang="pt-BR"`);
      expect(pb).toContain(`lang="pt-BR"`);
      const ca = await (await fetch(`${a.url}/css/site.css`)).text();
      const cb = await (await fetch(`${b.url}/css/site.css`)).text();
      expect(ca).toBe(cb);
    } finally {
      await a.fechar();
      await b.fechar();
    }
  });

  it("gzip para texto quando o cliente aceita; binário sem gzip; faltas registradas", async () => {
    const s = await servirSnapshot(join(tmp, "snapshot"), "original");
    try {
      const { request } = await import("node:http");
      const get = (path: string) =>
        new Promise<{ status: number; headers: Record<string, unknown>; corpo: Buffer }>((ok, erro) => {
          const req = request(`${s.url}${path}`, { headers: { "accept-encoding": "gzip" } }, (res) => {
            const partes: Buffer[] = [];
            res.on("data", (c: Buffer) => partes.push(c));
            res.on("end", () => ok({ status: res.statusCode ?? 0, headers: res.headers, corpo: Buffer.concat(partes) }));
          });
          req.on("error", erro);
          req.end();
        });
      const css = await get("/css/site.css");
      expect(css.headers["content-encoding"]).toBe("gzip");
      expect(gunzipSync(css.corpo).toString("utf8")).toContain("/_ext/cdn.exemplo.com/bg.png");
      const png = await get("/img/logo.png");
      expect(png.headers["content-encoding"]).toBeUndefined();
      const redir = await get("/");
      expect(redir.status).toBe(301);
      expect(redir.headers.location).toBe("/portal/");
      expect((await get("/nao/existe.js")).status).toBe(404);
      expect(s.faltas).toEqual(["/nao/existe.js"]);
    } finally {
      await s.fechar();
    }
  });

  it("variante corrigida inexistente dá erro claro", async () => {
    const t = mkdtempSync(join(tmpdir(), "servidor-"));
    try {
      gravarSnapshot({ siteId: "exemplo.ufrn.br", dirRaw: join(FIX, "raw", "exemplo.ufrn.br"), dirProcessado: t, meta: META });
      await expect(servirSnapshot(join(t, "snapshot"), "corrigido")).rejects.toThrow(/fixed\.html/);
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });
});

describe("acimaDoRuido", () => {
  const c = (proporcao: number | null) => ({ tamanhoA: [1, 1], tamanhoB: [1, 1], diferentes: proporcao === null ? null : 0, proporcao });
  it("compara a diferença coleta × local com o ruído local × local", () => {
    expect(acimaDoRuido(c(0.01), c(0.001))).toBe(true);
    expect(acimaDoRuido(c(0), c(0))).toBe(false);
    expect(acimaDoRuido(c(null), c(0))).toBe(true);
    expect(acimaDoRuido(c(0.1), c(null))).toBeNull();
  });
});
