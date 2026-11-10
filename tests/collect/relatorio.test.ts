import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  commitsDaColeta,
  contarDistintos,
  lerColeta,
  montarRelatorioColeta,
  periodoDaColeta,
  type SiteColeta,
  variacaoLighthouse,
  versoesDaColeta,
} from "../../src/collect/relatorio.js";
import type { Meta } from "../../src/shared/types.js";

const RAW = join("tests", "fixtures", "collect", "raw-retomada");

const meta = (collectedAt: string, extra: Partial<Meta> = {}) => ({
  collectedAt,
  toolVersions: { node: "24.19.0", lighthouse: "13.5.0", playwright: "1.64.1", chromium: "156.0.8078.4" },
  gitCommit: "abc123",
  gitDirty: false,
  ...extra,
});

const run = (n: number, startedAt: string, durationMs: number) =>
  ({ n, startedAt, durationMs }) as NonNullable<SiteColeta["lighthouse"]>["execucoes"] extends (infer R)[] | undefined
    ? R
    : never;

function site(
  id: string,
  opts: { ok?: boolean; amplitude?: number | null; n?: number | null; nFcpTti?: number | null; refresh?: boolean } = {},
): SiteColeta {
  const ok = opts.ok ?? true;
  return {
    estado: {
      id,
      page: "completo",
      lighthouse: ok ? "completo" : "incompleto",
      motivos: ok ? [] : ["lighthouse:ERRORED_DOCUMENT_REQUEST"],
    },
    page: {
      meta: meta("2026-11-09T18:00:00.000Z"),
      metaRefresh: opts.refresh ? { conteudo: "0;url=/x", atrasoS: 0, destino: "https://x/" } as never : null,
    },
    lighthouse: {
      meta: meta("2026-11-09T18:00:10.000Z"),
      execucoes: [run(1, "2026-11-09T18:00:10.000Z", 10_000), run(2, "2026-11-09T18:00:20.000Z", 10_000)],
      mediana: {
        criterio: "nota-performance",
        n: opts.n === undefined ? 1 : opts.n,
        notas: null,
        nFcpTti: opts.nFcpTti === undefined ? 1 : opts.nFcpTti,
      },
      variacaoPerformance: {
        n: 3,
        min: 0,
        max: 0,
        amplitude: opts.amplitude === undefined ? 2 : opts.amplitude,
        media: 0,
        desvioPadrao: null,
      } as never,
    },
  };
}

describe("periodoDaColeta", () => {
  it("vai do primeiro collectedAt ao fim da última execução do Lighthouse", () => {
    const b = site("b.ufrn.br");
    b.lighthouse!.execucoes = [run(1, "2026-11-09T19:00:00.000Z", 45_000)];
    expect(periodoDaColeta([site("a.ufrn.br"), b])).toEqual({
      inicio: "2026-11-09T18:00:00.000Z",
      fim: "2026-11-09T19:00:45.000Z",
      duracaoS: 3645,
    });
  });
  it("sem registros devolve nulos", () => {
    const s: SiteColeta = { estado: { id: "x", page: "pendente", lighthouse: "pendente", motivos: [] }, page: null, lighthouse: null };
    expect(periodoDaColeta([s])).toEqual({ inicio: null, fim: null, duracaoS: null });
  });
});

describe("contarDistintos / commits / versões", () => {
  it("ordena por frequência e depois alfabeticamente", () => {
    expect(contarDistintos(["b", "a", "b", "c", "a", "b"])).toEqual([
      ["b", 3],
      ["a", 2],
      ["c", 1],
    ]);
  });
  it("marca registros com gitDirty", () => {
    const sujo = site("s.ufrn.br");
    sujo.page!.meta = meta("2026-11-09T18:00:00.000Z", { gitCommit: "def456", gitDirty: true });
    expect(commitsDaColeta([site("a.ufrn.br"), sujo])).toEqual([
      ["abc123", 3],
      ["def456 (gitDirty: true)", 1],
    ]);
  });
  it("conta cada versão de ferramenta por registro", () => {
    expect(versoesDaColeta([site("a.ufrn.br")])).toContainEqual(["chromium 156.0.8078.4", 2]);
  });
});

describe("variacaoLighthouse", () => {
  it("resume amplitude e compara as duas medianas", () => {
    const v = variacaoLighthouse([
      site("a.ufrn.br", { amplitude: 2 }),
      site("b.ufrn.br", { amplitude: 12, n: 2, nFcpTti: 3 }),
      site("c.ufrn.br", { amplitude: 5 }),
    ]);
    expect(v).toEqual({
      n: 3,
      medianaAmplitude: 5,
      maxAmplitude: 12,
      amplitude10oumais: 1,
      medianasDiferentes: 1,
      comAsDuasMedianas: 3,
    });
  });
  it("ignora sites sem amplitude ou sem as duas medianas", () => {
    const v = variacaoLighthouse([site("a.ufrn.br", { amplitude: null, n: null })]);
    expect(v.n).toBe(0);
    expect(v.medianaAmplitude).toBeNull();
    expect(v.comAsDuasMedianas).toBe(0);
  });
});

describe("montarRelatorioColeta", () => {
  const md = montarRelatorioColeta({
    sites: [site("a.ufrn.br", { refresh: true }), site("chico.ufrn.br", { ok: false })],
    meta: { generatedAt: "2026-11-09T22:00:00.000Z", toolVersions: { node: "24.19.0", lighthouse: null, playwright: null }, gitCommit: "abc123", gitDirty: false },
    comando: "npm run collect:report",
  });
  it("traz resumo, motivos, sites com falha e meta refresh", () => {
    expect(md).toContain("| Completos (page + lighthouse) | 1 | 50,0% |");
    expect(md).toContain("| Com falha | 1 | 50,0% |");
    expect(md).toContain("| `lighthouse:ERRORED_DOCUMENT_REQUEST` | 1 |");
    expect(md).toContain("| chico.ufrn.br | completo | incompleto | `lighthouse:ERRORED_DOCUMENT_REQUEST` |");
    expect(md).toContain("no HTML bruto: **1**");
    expect(md).toContain("| `abc123` | 4 |");
    expect(md).toContain("**Duração (início → fim):** 0min30s");
  });
  it("sem falhas diz 'Nenhuma falha.'", () => {
    const limpo = montarRelatorioColeta({
      sites: [site("a.ufrn.br")],
      meta: { generatedAt: "x", toolVersions: { node: null, lighthouse: null, playwright: null }, gitCommit: null, gitDirty: false },
      comando: "c",
    });
    expect(limpo).toContain("Nenhuma falha.");
  });
});

describe("lerColeta (fixtures da S07)", () => {
  it("lê registros válidos e tolera ausentes e ilegíveis", () => {
    const sites = lerColeta(RAW, ["completo.ufrn.br", "ilegivel.ufrn.br", "nao-existe.ufrn.br"]);
    expect(sites[0]!.estado.page).toBe("completo");
    expect(sites[0]!.page).not.toBeNull();
    expect(sites[1]!.estado.motivos.some((m) => m.endsWith("registro-ilegivel"))).toBe(true);
    expect(sites[2]!.estado).toMatchObject({ page: "pendente", lighthouse: "pendente" });
    expect(sites[2]!.page).toBeNull();
    // O relatório não quebra com registros mínimos (sem meta).
    expect(() =>
      montarRelatorioColeta({
        sites,
        meta: { generatedAt: "x", toolVersions: { node: null, lighthouse: null, playwright: null }, gitCommit: null, gitDirty: false },
        comando: "c",
      }),
    ).not.toThrow();
  });
});
