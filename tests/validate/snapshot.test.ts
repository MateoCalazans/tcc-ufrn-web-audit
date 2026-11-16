import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { Meta } from "../../src/shared/types.js";
import {
  ancorarRaizExterna,
  caminhoLocal,
  comCharsetUtf8,
  gravarSnapshot,
  type HarCompleto,
  montarDoHar,
  prepararHtml,
  reescreverUrls,
  removerIntegridade,
} from "../../src/validate/snapshot.js";

const FIX = join("tests", "fixtures", "validate");
const RAW = join(FIX, "raw", "exemplo.ufrn.br");
const har = () => JSON.parse(readFileSync(join(RAW, "page.har"), "utf8")) as HarCompleto;
const META: Meta = { generatedAt: "2026-11-16T00:00:00.000Z", toolVersions: { node: "x", lighthouse: null, playwright: null }, gitCommit: null, gitDirty: false };

describe("caminhoLocal", () => {
  it("host principal vira caminho relativo à raiz, com a query", () => {
    expect(caminhoLocal("https://exemplo.ufrn.br/a/b.css?v=1", "exemplo.ufrn.br")).toBe("/a/b.css?v=1");
  });
  it("outro host vai para /_ext/<host>, em minúsculas", () => {
    expect(caminhoLocal("https://CDN.exemplo.com/x.js", "exemplo.ufrn.br")).toBe("/_ext/cdn.exemplo.com/x.js");
  });
  it("http e https do host principal dão o mesmo caminho; porta faz parte do host", () => {
    expect(caminhoLocal("http://exemplo.ufrn.br/", "exemplo.ufrn.br")).toBe("/");
    expect(caminhoLocal("https://exemplo.ufrn.br:8443/x", "exemplo.ufrn.br")).toBe("/_ext/exemplo.ufrn.br:8443/x");
  });
});

describe("reescreverUrls", () => {
  const r = (t: string) => reescreverUrls(t, "exemplo.ufrn.br", ["cdn.exemplo.com"]);

  it("troca só esquema e host, nas formas https, http e //", () => {
    expect(r(`<a href="https://exemplo.ufrn.br/p?q=1#f">`)).toBe(`<a href="/p?q=1#f">`);
    expect(r(`src="http://cdn.exemplo.com/x.js"`)).toBe(`src="/_ext/cdn.exemplo.com/x.js"`);
    expect(r(`src="//cdn.exemplo.com/x.js"`)).toBe(`src="/_ext/cdn.exemplo.com/x.js"`);
  });
  it("barra dupla depois do host principal vira /.// (caminho local, não host `assets`)", () => {
    expect(r(`href="https://exemplo.ufrn.br//assets/a.css"`)).toBe(`href="/.//assets/a.css"`);
    expect(r(`"https:\\/\\/exemplo.ufrn.br\\/\\/assets\\/a.js"`)).toBe(`"\\/.\\/\\/assets\\/a.js"`);
    // O navegador resolve /.//x como o caminho //x no mesmo servidor.
    expect(new URL("/.//assets/a.css", "http://127.0.0.1:8080/p/").href).toBe("http://127.0.0.1:8080//assets/a.css");
    // host externo com barra dupla continua um caminho sob /_ext/
    expect(r(`src="https://cdn.exemplo.com//lib.js"`)).toBe(`src="/_ext/cdn.exemplo.com//lib.js"`);
  });
  it("host sem caminho ganha a barra", () => {
    expect(r(`href="https://exemplo.ufrn.br"`)).toBe(`href="/"`);
    expect(r(`href="https://cdn.exemplo.com?x=1"`)).toBe(`href="/_ext/cdn.exemplo.com/?x=1"`);
  });
  it("forma escapada de JSON/JS mantém o escape", () => {
    expect(r(String.raw`"https:\/\/exemplo.ufrn.br\/api"`)).toBe(String.raw`"\/api"`);
    expect(r(String.raw`"https:\/\/cdn.exemplo.com\/x"`)).toBe(String.raw`"\/_ext\/cdn.exemplo.com\/x"`);
  });
  it("não toca em hosts fora da lista, nem em subdomínio ou sufixo", () => {
    expect(r(`href="https://sigaa.ufrn.br/"`)).toBe(`href="https://sigaa.ufrn.br/"`);
    expect(r(`href="https://www.exemplo.ufrn.br/"`)).toBe(`href="https://www.exemplo.ufrn.br/"`);
    expect(r(`href="https://exemplo.ufrn.br.evil.com/"`)).toBe(`href="https://exemplo.ufrn.br.evil.com/"`);
  });
  it("não confunde // no meio de um caminho com URL sem esquema", () => {
    expect(r(`href="/a//cdn.exemplo.com/x"`)).toBe(`href="/a//cdn.exemplo.com/x"`);
  });
  it("ignora maiúsculas no host", () => {
    expect(r(`url(HTTPS://CDN.Exemplo.com/a.png)`)).toBe(`url(/_ext/cdn.exemplo.com/a.png)`);
  });
});

describe("ancorarRaizExterna", () => {
  it("CSS: url(/x) e @import \"/x\" vão para /_ext/<host>", () => {
    expect(ancorarRaizExterna(`a{b:url(/i.png)} c{d:url('/j.png')} @import "/k.css";`, "cdn.x.com", "text/css")).toBe(
      `a{b:url(/_ext/cdn.x.com/i.png)} c{d:url('/_ext/cdn.x.com/j.png')} @import "/_ext/cdn.x.com/k.css";`,
    );
  });
  it("CSS: não mexe em url(//host), url(https:) nem caminho relativo", () => {
    const css = `a{b:url(//h.com/i.png)} c{d:url(https://h.com/j.png)} e{f:url(img/k.png)}`;
    expect(ancorarRaizExterna(css, "cdn.x.com", "text/css")).toBe(css);
  });
  it("HTML: src/href relativos à raiz", () => {
    expect(ancorarRaizExterna(`<img src="/a.png"><a href='/b'>`, "cdn.x.com", "text/html")).toBe(`<img src="/_ext/cdn.x.com/a.png"><a href='/_ext/cdn.x.com/b'>`);
  });
  it("JS não é tocado (limitação)", () => {
    expect(ancorarRaizExterna(`fetch("/api")`, "cdn.x.com", "application/javascript")).toBe(`fetch("/api")`);
  });
});

describe("removerIntegridade e prepararHtml", () => {
  it("remove integrity com aspas duplas, simples e sem aspas; mantém o resto da tag", () => {
    expect(removerIntegridade(`<link href="a" integrity="sha384-x" crossorigin><script integrity='y' src=b></script><x integrity=z>`)).toBe(
      `<link href="a" crossorigin><script src=b></script><x>`,
    );
  });
  it("não remove 'integrity' fora de tag", () => {
    expect(removerIntegridade(`<p>integrity="x"</p>`)).toBe(`<p>integrity="x"</p>`);
  });
  it("preserva os bytes não ASCII (latin1 e UTF-8)", () => {
    const latin1 = Buffer.from([0x3c, 0x70, 0x3e, 0xe9, 0x3c, 0x2f, 0x70, 0x3e]); // <p>é</p> em latin1
    expect(prepararHtml(latin1, "exemplo.ufrn.br", []).equals(latin1)).toBe(true);
    const utf8 = Buffer.from(`<a href="https://exemplo.ufrn.br/ação">ç</a>`, "utf8");
    expect(prepararHtml(utf8, "exemplo.ufrn.br", []).toString("utf8")).toBe(`<a href="/ação">ç</a>`);
  });
});

describe("comCharsetUtf8", () => {
  it("troca ou acrescenta o charset", () => {
    expect(comCharsetUtf8("text/css; charset=iso-8859-1")).toBe("text/css; charset=utf-8");
    expect(comCharsetUtf8("application/javascript")).toBe("application/javascript; charset=utf-8");
  });
});

describe("montarDoHar", () => {
  const m = montarDoHar(har(), "exemplo.ufrn.br", "/portal/");

  it("lista os hosts externos do HAR, sem o principal", () => {
    expect(m.hostsExternos).toEqual(["cdn.exemplo.com", "ajax.googleapis.com"]);
  });
  it("a página principal fica fora (vem do index.html/fixed.html)", () => {
    expect(m.entradas["/portal/"]).toBeUndefined();
  });
  it("redirecionamento vira entrada com Location local; para si mesmo é descartado", () => {
    expect(m.entradas["/"]).toMatchObject({ status: 301, location: "/portal/", arquivo: null });
    expect(m.entradas["/laco"]).toBeUndefined();
  });
  it("texto é reescrito e servido em UTF-8", () => {
    const e = m.entradas["/css/site.css"]!;
    expect(e.contentType).toBe("text/css; charset=utf-8");
    expect(m.arquivos.get(e.arquivo!)!.toString("utf8")).toBe("body{background:url(/_ext/cdn.exemplo.com/bg.png)} .x{background:url(/img/logo.png)}");
  });
  it("CSS de host externo tem os caminhos da raiz ancorados", () => {
    const e = m.entradas["/_ext/cdn.exemplo.com/fonte.css"]!;
    expect(m.arquivos.get(e.arquivo!)!.toString("utf8")).toBe(`@font-face{src:url("/_ext/cdn.exemplo.com/f/a.woff2")} @import "/_ext/cdn.exemplo.com/f/b.css";`);
  });
  it("JS: URL escapada do host principal é reescrita", () => {
    const e = m.entradas["/_ext/cdn.exemplo.com/lib.js?v=2"]!;
    expect(m.arquivos.get(e.arquivo!)!.toString("utf8")).toBe(String.raw`var u="\/api";fetch("/_ext/cdn.exemplo.com/dados.json")`);
  });
  it("binário (base64) é decodificado, sem reescrita, com o mimeType original", () => {
    const e = m.entradas["/img/logo.png"]!;
    expect(e.contentType).toBe("image/png");
    expect(m.arquivos.get(e.arquivo!)!.subarray(1, 4).toString("latin1")).toBe("PNG");
  });
  it("conteúdo igual vira um arquivo só", () => {
    expect(m.entradas["/img/logo.png"]!.arquivo).toBe(m.entradas["/_ext/cdn.exemplo.com/bg.png"]!.arquivo);
  });
  it("200 tem prioridade sobre 404 na mesma URL, e o 404 não vira limitação", () => {
    expect(m.entradas["/_ext/cdn.exemplo.com/lib.js?v=2"]!.status).toBe(200);
  });
  it("registra as limitações por motivo", () => {
    expect(m.limitacoes).toEqual([
      { url: "http://ajax.googleapis.com/jquery.js", motivo: "falha-na-coleta" },
      { url: "https://exemplo.ufrn.br/api/log", motivo: "metodo-nao-get" },
      { url: "https://exemplo.ufrn.br/vazio", motivo: "sem-corpo" },
      { url: "https://exemplo.ufrn.br/latin1.js", motivo: "texto-corrompido" },
      { url: "data:image/gif;base64,R0lGOD", motivo: "url-nao-http" },
    ]);
    // O texto corrompido continua servido (é o que o HAR tem).
    expect(m.entradas["/latin1.js"]).toBeDefined();
  });
  it("só guarda arquivos referenciados", () => {
    const usados = new Set(Object.values(m.entradas).map((e) => e.arquivo).filter(Boolean));
    expect(new Set(m.arquivos.keys())).toEqual(usados);
  });
});

describe("gravarSnapshot", () => {
  let tmp: string | null = null;
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  });

  it("grava manifesto, arquivos e as duas variantes com a mesma transformação", () => {
    tmp = mkdtempSync(join(tmpdir(), "snapshot-"));
    copyFileSync(join(FIX, "processed", "fixed.html"), join(tmp, "fixed.html"));
    const m = gravarSnapshot({ siteId: "exemplo.ufrn.br", dirRaw: RAW, dirProcessado: tmp, meta: META });
    const dir = join(tmp, "snapshot");

    expect(m.caminhoPagina).toBe("/portal/");
    expect(m.urlPagina).toBe("https://exemplo.ufrn.br/portal/");
    expect(m.contentTypePagina).toBe("text/html; charset=iso-8859-1");
    expect(m.variantes).toEqual({ original: "original.html", corrigido: "corrigido.html" });
    expect(m.resumo).toMatchObject({ entradasHar: 14, redirecionamentos: 1 });
    expect(m.resumo.limitacoesPorMotivo).toEqual({ "falha-na-coleta": 1, "metodo-nao-get": 1, "sem-corpo": 1, "texto-corrompido": 1, "url-nao-http": 1 });
    expect(m.meta.gitCommit).toBeNull();
    expect(readdirSync(join(dir, "arquivos")).sort()).toEqual([...new Set(Object.values(m.entradas).map((e) => e.arquivo).filter((a): a is string => a !== null))].sort());

    const original = readFileSync(join(dir, "original.html"), "latin1");
    expect(original).toContain(`<base href="/portal/">`);
    expect(original).toContain(`<link rel="stylesheet" href="/css/site.css" crossorigin="anonymous">`);
    expect(original).toContain(`<script src="/_ext/cdn.exemplo.com/lib.js?v=2"></script>`);
    expect(original).toContain(`<a href="https://sigaa.ufrn.br/">`);
    expect(original).toContain("Exemplo \xe9"); // byte latin1 preservado

    // As duas variantes diferem exatamente nas linhas em que index.html e fixed.html diferem.
    const linhas = (f: string) => readFileSync(f, "latin1").split("\n");
    const difs = (a: string[], b: string[]) => a.map((l, i) => (l === b[i] ? -1 : i)).filter((i) => i >= 0);
    expect(difs(linhas(join(dir, "original.html")), linhas(join(dir, "corrigido.html")))).toEqual(
      difs(linhas(join(RAW, "index.html")), linhas(join(FIX, "processed", "fixed.html"))),
    );
  });

  it("sem fixed.html, só a variante original; apaga cópia anterior", () => {
    tmp = mkdtempSync(join(tmpdir(), "snapshot-"));
    copyFileSync(join(FIX, "processed", "fixed.html"), join(tmp, "fixed.html"));
    gravarSnapshot({ siteId: "exemplo.ufrn.br", dirRaw: RAW, dirProcessado: tmp, meta: META });
    rmSync(join(tmp, "fixed.html"));
    const m = gravarSnapshot({ siteId: "exemplo.ufrn.br", dirRaw: RAW, dirProcessado: tmp, meta: META });
    expect(m.variantes.corrigido).toBeNull();
    expect(existsSync(join(tmp, "snapshot", "corrigido.html"))).toBe(false);
  });
});
