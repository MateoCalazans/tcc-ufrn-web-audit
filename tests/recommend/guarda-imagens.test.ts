import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { aplicarRegras, montarResultado } from "../../src/recommend/engine.js";
import {
  desfazerReprovadas,
  guardarImagens,
  julgar,
  MARCADOR,
  type Medicao,
  prepararMedicao,
  urlsRespondidas,
  veredito,
} from "../../src/recommend/guarda-imagens.js";
import { imgDimensions } from "../../src/recommend/rules/img-dimensions.js";
import type { Har, Recommendation } from "../../src/shared/types.js";

/** PNG válido (decodificável pelo navegador), cinza, `w`×`h`. */
function pngReal(w: number, h: number): Buffer {
  const bloco = (tipo: string, dados: Buffer) => {
    const t = Buffer.from(tipo, "latin1");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 0; // tons de cinza
  const linhas = Buffer.alloc((w + 1) * h, 0x80);
  for (let y = 0; y < h; y++) linhas[y * (w + 1)] = 0; // filtro 0 em cada linha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr),
    bloco("IDAT", deflateSync(linhas)),
    bloco("IEND", Buffer.alloc(0)),
  ]);
}

function entrada(url: string, mime: string, corpo: Buffer) {
  return {
    startedDateTime: "2026-11-09T12:00:00.000Z",
    time: 1,
    request: { method: "GET", url, httpVersion: "HTTP/1.1", headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: 0 },
    response: {
      status: 200,
      statusText: "OK",
      httpVersion: "HTTP/1.1",
      headers: [{ name: "content-type", value: mime }],
      cookies: [],
      content: { size: corpo.length, mimeType: mime, text: corpo.toString("base64"), encoding: "base64" },
      redirectURL: "",
      headersSize: -1,
      bodySize: corpo.length,
    },
    cache: {},
    timings: { send: 0, wait: 0, receive: 0 },
  };
}

const rec = (id: string, regra: string, inicio: number, texto: string): Recommendation => ({
  id,
  regra,
  severidade: "media",
  dimensao: "performance",
  evidencia: "",
  posicao: null,
  correcaoAutomatica: true,
  mensagem: "m",
  edicoes: [{ inicio, fim: inicio, texto }],
});

describe("prepararMedicao", () => {
  it("marca as imagens da img-dimensions nas duas variantes; as outras regras só no corrigido", () => {
    const html = `<img src="a.png"><img src="b.png"><html lang>`;
    const recs = [rec("img-dimensions-1", "img-dimensions", 16, ` width="1" height="2"`), rec("html-lang-1", "html-lang", 44, `="pt-BR"`)];
    const m = prepararMedicao(html, recs);
    expect(m.original).toBe(`<img src="a.png" ${MARCADOR}="1"><img src="b.png"><html lang>`);
    expect(m.corrigido).toBe(`<img src="a.png" ${MARCADOR}="1" width="1" height="2"><img src="b.png"><html lang="pt-BR">`);
    expect([...m.marcadores]).toEqual([["1", "img-dimensions-1"]]);
  });
});

describe("veredito e julgar", () => {
  const med = (largura: number, altura: number, carregada = true): Medicao => ({ "1": { largura, altura, carregada } });
  it("igual dentro da tolerância; mudou fora; instável se o original varia; não medida se falta ou não carregou", () => {
    expect(veredito("1", med(40, 10), med(40, 10), med(40.3, 10))).toBe("igual");
    expect(veredito("1", med(40, 10), med(40, 10), med(80, 10))).toBe("mudou");
    expect(veredito("1", med(40, 10), med(50, 10), med(40, 10))).toBe("instavel");
    expect(veredito("1", med(40, 10), med(40, 10), med(40, 10, false))).toBe("nao-medida");
    expect(veredito("1", med(40, 10), med(40, 10), {})).toBe("nao-medida");
  });
  it("mantém só se for igual em todos os viewports; sem viewport, nada é mantido", () => {
    const marcadores = new Map([["1", "img-dimensions-1"]]);
    const igual = { o1: med(40, 10), o2: med(40, 10), c: med(40, 10) };
    const mudou = { o1: med(40, 10), o2: med(40, 10), c: med(80, 10) };
    expect(julgar(marcadores, { mobile: igual, desktop: igual }).mantidas).toBe(1);
    expect(julgar(marcadores, { mobile: igual, desktop: mudou }).desfeitas).toBe(1);
    expect(julgar(marcadores, {}).desfeitas).toBe(1);
  });
  it("desfazerReprovadas tira as edições e explica o motivo", () => {
    const recs = [rec("img-dimensions-1", "img-dimensions", 5, " width=\"1\"")];
    const g = julgar(new Map([["1", "img-dimensions-1"]]), { mobile: { o1: med(40, 10), o2: med(40, 10), c: med(80, 10) } });
    const [r] = desfazerReprovadas(recs, g);
    expect(r).toMatchObject({ correcaoAutomatica: false, edicoes: [] });
    expect(r!.mensagem).toContain("mobile: mudou");
  });
});

describe("urlsRespondidas", () => {
  it("deixa de fora as requisições que falharam na coleta (status −1)", () => {
    const har = { log: { entries: [
      { request: { url: "https://a/ok.css" }, response: { status: 200 } },
      { request: { url: "https://fonts.googleapis.com/css" }, response: { status: -1 } },
      { request: { url: "https://a/redir" }, response: { status: 301 } },
    ] } };
    expect([...urlsRespondidas(har)]).toEqual(["https://a/ok.css", "https://a/redir"]);
  });
});

describe("guardarImagens (integração: HAR + Chromium)", () => {
  let tmp: string;
  let browser: Browser;
  const URL_PAGINA = "https://exemplo.ufrn.br/";
  // Logo 80×20 com o CSS fixando só a altura (10 px): sem atributos, aparece 40×10;
  // com width="80" height="20", o width passa a valer e ela distorce para 80×10.
  const html =
    `<!doctype html><html><head><link rel="stylesheet" href="/s.css"><link rel="stylesheet" href="https://fonts.exemplo.com/css"></head><body>` +
    `<img class="logo" src="/logo.png"><img src="/foto.png"></body></html>`;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), "guarda-"));
    const har = {
      log: {
        version: "1.2",
        creator: { name: "teste", version: "1" },
        entries: [
          entrada(URL_PAGINA, "text/html", Buffer.from(html)),
          entrada(`${URL_PAGINA}s.css`, "text/css", Buffer.from(".logo{height:10px}")),
          entrada(`${URL_PAGINA}logo.png`, "image/png", pngReal(80, 20)),
          entrada(`${URL_PAGINA}foto.png`, "image/png", pngReal(30, 30)),
          // Folha que falhou na coleta (status −1): sem o aborto, o routeFromHAR fica pendurado.
          { ...entrada("https://fonts.exemplo.com/css", "x-unknown", Buffer.alloc(0)), response: { status: -1, statusText: "", httpVersion: "", headers: [], cookies: [], content: { size: -1, mimeType: "x-unknown" }, redirectURL: "", headersSize: -1, bodySize: -1 } },
        ],
      },
    };
    writeFileSync(join(tmp, "page.har"), JSON.stringify(har));
    browser = await chromium.launch();
  });
  afterAll(async () => {
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("desfaz a correção que distorce e mantém a que não muda o tamanho", async () => {
    const harCompleto = JSON.parse(readFileSync(join(tmp, "page.har"), "utf8")) as Har;
    const r = await aplicarRegras({ siteId: "exemplo.ufrn.br", url: URL_PAGINA, html, har: harCompleto }, [imgDimensions]);
    expect(r.resumo.corrigidas).toBe(2); // sem a guarda, as duas seriam corrigidas

    const g = await guardarImagens(browser, { harPath: join(tmp, "page.har"), url: URL_PAGINA, contentType: "text/html" }, html, r.recommendations, (t) => Buffer.from(t));
    expect(g.erro).toBeNull();
    const porImagem = Object.fromEntries(g.imagens.map((i) => [i.recomendacao, i]));
    expect(porImagem["img-dimensions-1"]).toMatchObject({ mantida: false, vereditos: { mobile: "mudou", desktop: "mudou" } });
    expect(porImagem["img-dimensions-1"]!.medidas.mobile).toEqual({
      original: { largura: 40, altura: 10, carregada: true },
      corrigido: { largura: 80, altura: 10, carregada: true },
    });
    expect(porImagem["img-dimensions-2"]).toMatchObject({ mantida: true, vereditos: { mobile: "igual", desktop: "igual" } });

    const final = montarResultado(html, ["img-dimensions"], desfazerReprovadas(r.recommendations, g));
    expect(final.resumo.corrigidas).toBe(1);
    expect(final.fixedHtml).toContain(`<img class="logo" src="/logo.png">`);
    expect(final.fixedHtml).toContain(`<img src="/foto.png" width="30" height="30">`);
    expect(final.fixedHtml).not.toContain(MARCADOR);
  }, 60_000);
});
