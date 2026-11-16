import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  type Contexto,
  classificarTrecho,
  conferir,
  extrairReferencias,
  padraoParaRegex,
  prefixoDoPadrao,
} from "../../src/evidencias/referencias.js";

const md = readFileSync(join("tests", "fixtures", "evidencias", "rastreabilidade.md"), "utf8");

describe("classificarTrecho", () => {
  it.each([
    ["src/triage/normalize.ts", "caminho"],
    ["docs/resultados/tabelas/", "caminho"],
    ["data/processed/sites/<id>/validation.json", "padrao"],
    ["server.ts", "nome"],
    ["metaRefresh", null],
    ["--vnu", null],
    ["npm run analyze", null],
    ["src/recommend/rules/", "caminho"],
    ["https://x.org/a.md", null],
  ])("%s → %s", (t, esperado) => {
    expect(classificarTrecho(t)).toBe(esperado);
  });
});

describe("extrairReferencias", () => {
  it("acha caminhos, nomes, padrões, links, ADRs e tags sem repetir", () => {
    const r = extrairReferencias(md);
    const por = (tipo: string) => r.filter((x) => x.tipo === tipo).map((x) => x.valor);
    expect(por("caminho")).toEqual(["src/triage/normalize.ts", "docs/resultados/tabelas/", "src/nao-existe.ts"]);
    expect(por("nome")).toEqual(["server.ts", "revisao.csv", "validation.json"]);
    expect(por("padrao")).toEqual(["data/processed/sites/<id>/validation.json"]);
    expect(por("link")).toEqual(["../diario/2026-11-16-s18.md"]);
    expect(por("adr")).toEqual(["001", "004", "014", "016"]);
    expect(por("tag")).toEqual(["v0.1-triagem", "v1.0"]);
    expect(r.find((x) => x.valor === "src/nao-existe.ts")?.linha).toBe(4);
  });
});

describe("padrões", () => {
  it("prefixo e regex", () => {
    expect(prefixoDoPadrao("data/processed/sites/<id>/validation.json")).toBe("data/processed/sites/");
    const re = padraoParaRegex("docs/resultados/tabelas/validacao-*.csv");
    expect(re.test("docs/resultados/tabelas/validacao-wilcoxon.csv")).toBe(true);
    expect(re.test("docs/resultados/tabelas/sub/validacao-x.csv")).toBe(false);
    const dir = padraoParaRegex("data/processed/sites/<id>/");
    expect(dir.test("data/processed/sites/a.ufrn.br/metrics.json")).toBe(true);
    expect(dir.test("data/processed/dataset.csv")).toBe(false);
  });
});

describe("conferir", () => {
  const ctx: Contexto = {
    versionados: [
      "src/triage/normalize.ts",
      "src/validate/server.ts",
      "docs/resultados/tabelas/descritivas.csv",
      "docs/diario/2026-11-16-s18.md",
    ],
    noDisco: [
      "src/triage/normalize.ts",
      "src/validate/server.ts",
      "docs/resultados/tabelas/descritivas.csv",
      "docs/diario/2026-11-16-s18.md",
      "data/processed/sites/a.ufrn.br/validation.json",
      "data/processed/sites/b.ufrn.br/validation.json",
      "docs/resultados/revisao.csv",
    ],
    tags: ["v0.1-triagem", "v1.0"],
    adrs: ["001", "004", "014"],
    dirBase: "docs/artigo",
  };
  const r = Object.fromEntries(extrairReferencias(md).map((x) => [`${x.tipo}:${x.valor}`, conferir(x, ctx)]));

  it("classifica cada referência", () => {
    expect(r["caminho:src/triage/normalize.ts"]!.situacao).toBe("ok");
    expect(r["caminho:docs/resultados/tabelas/"]!.situacao).toBe("ok");
    expect(r["caminho:src/nao-existe.ts"]!.situacao).toBe("ausente");
    const soGitkeep = { ...ctx, versionados: ["data/raw/.gitkeep"], noDisco: ["data/raw/.gitkeep", "data/raw/a/x.html"] };
    expect(conferir({ tipo: "caminho", valor: "data/raw/", linha: 1 }, soGitkeep).situacao).toBe("fora-do-git");
    expect(r["nome:server.ts"]).toMatchObject({ situacao: "ok", resolvido: "src/validate/server.ts" });
    expect(r["nome:revisao.csv"]!.situacao).toBe("fora-do-git");
    expect(r["nome:validation.json"]).toMatchObject({ situacao: "ambiguo", detalhe: "2 arquivos" });
    expect(r["padrao:data/processed/sites/<id>/validation.json"]).toMatchObject({
      situacao: "fora-do-git",
      detalhe: "0 versionados, 2 no disco",
    });
    expect(r["link:../diario/2026-11-16-s18.md"]).toMatchObject({
      situacao: "ok",
      resolvido: "docs/diario/2026-11-16-s18.md",
    });
    expect(r["adr:016"]!.situacao).toBe("ausente");
    expect(r["tag:v1.0"]!.situacao).toBe("ok");
  });
});
