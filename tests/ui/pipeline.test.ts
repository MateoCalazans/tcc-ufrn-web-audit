import { describe, expect, it } from "vitest";

import {
  carimbo,
  desfechoTriagem,
  gastoDoCsv,
  ipBloqueado,
  planoAvulso,
  planoCorpus,
  saldoLlm,
  validarUrl,
} from "../../src/ui/pipeline.js";

describe("validarUrl", () => {
  it.each([
    ["https://www.ufrn.br/institucional?x=1#a", "www.ufrn.br", "ufrn.br"],
    ["ppgsw.ufrn.br", "ppgsw.ufrn.br", "ppgsw.ufrn.br"],
    ["http://Exemplo.COM.br./pagina", "exemplo.com.br", "exemplo.com.br"],
    ["https://www.exemplo.org:443/", "www.exemplo.org", "exemplo.org"],
  ])("aceita %s", (entrada, host, id) => {
    expect(validarUrl(entrada)).toEqual({ ok: true, host, id });
  });

  it.each([
    ["", "URL vazia"],
    ["ftp://ufrn.br", "só http e https"],
    ["file:///etc/passwd", "só http e https"],
    ["javascript:alert(1)", "URL inválida"],
    ["https://user:senha@ufrn.br", "URL com credenciais"],
    ["http://127.0.0.1", "IP literal não é aceito; use o nome do site"],
    ["http://[::1]/", "IP literal não é aceito; use o nome do site"],
    ["http://2130706433/", "IP literal não é aceito; use o nome do site"],
    ["http://localhost:3000", "endereço local não é aceito"],
    ["http://api.localhost", "endereço local não é aceito"],
    ["http://intranet", "endereço local não é aceito"],
    ["http://servidor.local", "domínio de rede interna"],
    ["https://ufrn.br:8080/", "porta não padrão"],
  ])("recusa %s", (entrada, motivo) => {
    expect(validarUrl(entrada)).toEqual({ ok: false, motivo });
  });
});

describe("ipBloqueado", () => {
  it.each([
    "10.1.2.3",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.10",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1%eth0",
    "ff02::1",
    "2001:db8::1",
    "64:ff9b::a00:1",
    "2002:a00:1::1",
    "não é ip",
  ])("bloqueia %s", (ip) => {
    expect(ipBloqueado(ip)).toBe(true);
  });

  it.each(["177.20.147.10", "8.8.8.8", "172.32.0.1", "2804:1f2a::10", "::ffff:8.8.8.8", "2001:4860:4860::8888"])(
    "libera %s",
    (ip) => {
      expect(ipBloqueado(ip)).toBe(false);
    },
  );
});

describe("carimbo", () => {
  it("UTC, sem dois-pontos", () => {
    expect(carimbo(new Date("2026-11-16T20:45:07.123Z"))).toBe("2026-11-16T20-45-07");
  });
});

describe("planos", () => {
  it("avulso sem LLM", () => {
    expect(planoAvulso({ id: "x.ufrn.br", llm: false, vnu: false, tetoUsd: 0 })).toEqual([
      { nome: "triagem", modulo: "src/triage/index.ts", args: [] },
      { nome: "sondagem", modulo: "src/triage/index.ts", args: ["--probe"] },
      { nome: "classificacao", modulo: "src/triage/index.ts", args: ["--classify"] },
      { nome: "coleta", modulo: "src/collect/index.ts", args: ["--site", "x.ufrn.br"] },
      { nome: "analise", modulo: "src/analyze/index.ts", args: [] },
      { nome: "recomendacao", modulo: "src/recommend/index.ts", args: ["--site", "x.ufrn.br"] },
    ]);
  });

  it("avulso com LLM e vnu passa o saldo como teto", () => {
    const p = planoAvulso({ id: "x.ufrn.br", llm: true, vnu: true, tetoUsd: 4.48671 });
    expect(p[4]!.args).toEqual(["--vnu"]);
    expect(p[5]!.args).toEqual(["--site", "x.ufrn.br", "--llm", "--teto-usd", "4.4867"]);
  });

  it("corpus: só regras, sem LLM", () => {
    expect(planoCorpus("mat.ufrn.br")).toEqual([
      { nome: "recomendacao", modulo: "src/recommend/index.ts", args: ["--site", "mat.ufrn.br"] },
    ]);
  });
});

describe("LLM", () => {
  it("saldo global e soma do csv", () => {
    expect(saldoLlm([0.0133, 0.002])).toBeCloseTo(4.4847, 6);
    expect(saldoLlm([5])).toBe(0);
    expect(saldoLlm([Number.NaN, 1])).toBe(3.5);
    expect(gastoDoCsv([{ custo_usd: "0.001" }, { custo_usd: "" }, { custo_usd: "0.0005" }])).toBeCloseTo(0.0015, 8);
  });
});

describe("desfechoTriagem", () => {
  const corpus = [
    { id: "a.ufrn.br", incluido: "true", url_final: "https://a.ufrn.br/portal/", motivo_exclusao: "" },
    { id: "b.ufrn.br", incluido: "false", url_final: "", motivo_exclusao: "robots" },
    { id: "c.ufrn.br", incluido: "true", url_final: "", motivo_exclusao: "" },
  ];
  it("incluído, excluído com motivo e ausente", () => {
    expect(desfechoTriagem(corpus, "a.ufrn.br")).toEqual({ incluido: true, url: "https://a.ufrn.br/portal/" });
    expect(desfechoTriagem(corpus, "c.ufrn.br")).toEqual({ incluido: true, url: "https://c.ufrn.br/" });
    expect(desfechoTriagem(corpus, "b.ufrn.br")).toEqual({ incluido: false, motivo: "robots" });
    expect(desfechoTriagem(corpus, "z.ufrn.br")).toEqual({ incluido: false, motivo: "site não aparece no corpus da triagem" });
  });
});
