import { describe, expect, it } from "vitest";

import type { Meta } from "../../src/shared/types.js";
import { amostraRevisao, buildCorpus, contar, renderTriagemMd, type CorpusRow } from "../../src/triage/corpus.js";
import type { NormalizedRow } from "../../src/triage/normalize.js";

const norm = (linha: string, host: string, situacao: NormalizedRow["situacao"], motivo = ""): NormalizedRow => ({
  linhaOriginal: linha,
  hostNormalizado: host,
  situacao,
  motivo,
  detalhe: "",
});

const probe = (host: string, incluido: boolean, motivo = "", urlFinal = `https://${host}/`, status = "200") => ({
  host,
  incluido: String(incluido),
  motivo_exclusao: motivo,
  detalhe: "",
  url_final: urlFinal,
  status,
  scheme: "https",
  cadeia_redirects: "",
});

const HTML: Record<string, string> = {
  "ppgsw.ufrn.br": '<title>PPgSW</title><meta name="generator" content="WordPress 6.4">',
};

describe("buildCorpus", () => {
  const normalized = [
    norm("www.ppgsw.ufrn.br", "ppgsw.ufrn.br", "mantido"),
    norm("ppgsw.ufrn.edu.br", "ppgsw.ufrn.br", "unificado"),
    norm("dns1.ufrn.br", "dns1.ufrn.br", "descartado", "infra"),
    norm("caido.ufrn.br", "caido.ufrn.br", "mantido"),
    norm("semhtml.ufrn.br", "semhtml.ufrn.br", "mantido"),
    norm("naosondado.ufrn.br", "naosondado.ufrn.br", "mantido"),
  ];
  const probed = [
    probe("ppgsw.ufrn.br", true),
    probe("caido.ufrn.br", false, "timeout", "", ""),
    probe("semhtml.ufrn.br", true),
  ];
  const { rows, naoSondados } = buildCorpus({
    normalized,
    probed,
    htmlDe: (h) => HTML[h] ?? null,
    dataTriagem: "2026-11-04",
  });
  const porId = Object.fromEntries(rows.map((r) => [r.id, r]));

  it("uma linha por host único (unificados não repetem), mantendo a linha original", () => {
    expect(rows.map((r) => r.id)).toEqual(["ppgsw.ufrn.br", "dns1.ufrn.br", "caido.ufrn.br", "semhtml.ufrn.br"]);
    expect(porId["ppgsw.ufrn.br"]?.urlOriginal).toBe("www.ppgsw.ufrn.br");
  });

  it("classifica incluídos com evidência", () => {
    expect(porId["ppgsw.ufrn.br"]).toMatchObject({
      incluido: true,
      status: 200,
      tipo: "pos-graduacao",
      tecnologia: "wordpress",
      titulo: "PPgSW",
      dataTriagem: "2026-11-04",
    });
  });

  it("infra entra como excluído por `infra`, sem classificação", () => {
    expect(porId["dns1.ufrn.br"]).toMatchObject({ incluido: false, motivoExclusao: "infra", tipo: "", status: null });
  });

  it("excluídos na sondagem mantêm o motivo e não são classificados", () => {
    expect(porId["caido.ufrn.br"]).toMatchObject({
      incluido: false,
      motivoExclusao: "timeout",
      urlFinal: null,
      status: null,
      tipo: "",
      tecnologia: "",
    });
  });

  it("incluído sem HTML guardado não é chutado", () => {
    expect(porId["semhtml.ufrn.br"]).toMatchObject({ tipo: "outro", evidenciaTipo: "html indisponível" });
  });

  it("conta mantidos não sondados (rodada com --limit)", () => {
    expect(naoSondados).toBe(1);
  });
});

describe("contar / amostraRevisao", () => {
  it("conta em ordem decrescente, empate alfabético", () => {
    expect(contar(["b", "a", "b", "c", "a", "b"])).toEqual([
      ["b", 3],
      ["a", 2],
      ["c", 1],
    ]);
  });

  const linha = (id: string, incluido: boolean): CorpusRow => ({
    id,
    urlOriginal: id,
    urlFinal: null,
    status: null,
    incluido,
    motivoExclusao: null,
    tipo: "outro",
    tecnologia: "estatico",
    dataTriagem: "2026-11-04",
    titulo: "",
    evidenciaTipo: "",
    evidenciaTecnologia: "",
    tlsInvalido: "",
  });

  it("amostra é determinística, só de incluídos e independe da ordem de entrada", () => {
    const rows = Array.from({ length: 50 }, (_, i) => linha(`s${i}.ufrn.br`, i % 5 !== 0));
    const a = amostraRevisao(rows, 10);
    const b = amostraRevisao([...rows].reverse(), 10);
    expect(a).toHaveLength(10);
    expect(a.every((r) => r.incluido)).toBe(true);
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });
});

describe("renderTriagemMd", () => {
  const meta: Meta = {
    generatedAt: "2026-11-04T12:00:00.000Z",
    toolVersions: { node: "v22.0.0", lighthouse: null, playwright: null },
    gitCommit: "abc123",
    gitDirty: false,
  };
  const funnel = { linhas: 6, unicos: 6, unificados: 5, aposFiltro: 4 };

  it("traz funil, contagens e aviso de sondagem parcial", () => {
    const rows: CorpusRow[] = buildCorpus({
      normalized: [norm("a.ufrn.br", "a.ufrn.br", "mantido"), norm("b.ufrn.br", "b.ufrn.br", "mantido")],
      probed: [probe("a.ufrn.br", true)],
      htmlDe: () => "<title>Laboratório X</title>",
      dataTriagem: "2026-11-04",
    }).rows;
    const md = renderTriagemMd({ funnel, rows, naoSondados: 1, dataTriagem: "2026-11-04", meta });
    expect(md).toContain("| **Incluídos no corpus** | **1** |");
    expect(md).toContain("| laboratorio | 1 | 100,0% |");
    expect(md).toContain("Sondagem parcial");
    expect(md).toContain("`abc123`");
  });
});
