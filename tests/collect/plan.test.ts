import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  codigoDoErro,
  estadoDoSite,
  estimarRestanteS,
  etapasPendentes,
  motivosLighthouse,
  motivosPage,
  resumirColeta,
  temRegistro,
} from "../../src/collect/plan.js";

const RAW = join("tests", "fixtures", "collect", "raw-retomada");

describe("codigoDoErro", () => {
  it("usa o code do undici entre parênteses", () => {
    expect(codigoDoErro("TypeError: fetch failed (ECONNREFUSED)")).toBe("ECONNREFUSED");
  });
  it("usa o net::ERR_ do Chromium", () => {
    expect(codigoDoErro("Error: page.goto: net::ERR_NAME_NOT_RESOLVED at https://x.ufrn.br/")).toBe(
      "ERR_NAME_NOT_RESOLVED",
    );
  });
  it("cai no nome do erro quando não há código", () => {
    expect(codigoDoErro("TimeoutError: page.goto: Timeout 30000ms exceeded.")).toBe("TimeoutError");
    expect(codigoDoErro("AbortError: This operation was aborted")).toBe("AbortError");
  });
  it("marca erros ao gravar o HAR", () => {
    expect(codigoDoErro("har: Error: ENOSPC: no space left (ENOSPC)")).toBe("har-ENOSPC");
  });
  it("mensagem vazia ou estranha vira 'desconhecido'", () => {
    expect(codigoDoErro("")).toBe("desconhecido");
    expect(codigoDoErro("algo deu errado")).toBe("desconhecido");
  });
});

describe("motivosPage / motivosLighthouse", () => {
  const ok = { ok: true, error: null };
  const arquivos = { raw: true, rendered: true, screenshot: true, har: true, record: true };

  it("registro completo não tem motivo", () => {
    expect(motivosPage({ completo: true, raw: ok, render: ok, arquivos } as never)).toEqual([]);
    expect(motivosLighthouse({ completo: true, execucoes: [] })).toEqual([]);
  });

  it("arquivo ausente só vira motivo se a etapa que o produz deu certo", () => {
    const r = {
      completo: false,
      raw: ok,
      render: { ok: false, error: "TimeoutError: page.goto: Timeout 30000ms exceeded." },
      arquivos: { ...arquivos, rendered: false, screenshot: false },
    };
    expect(motivosPage(r as never)).toEqual(["render:TimeoutError"]);
    const r2 = { completo: false, raw: ok, render: ok, arquivos: { ...arquivos, har: false } };
    expect(motivosPage(r2 as never)).toEqual(["page:arquivo-ausente-har"]);
  });

  it("incompleto sem causa identificável recebe motivo genérico", () => {
    expect(motivosPage({ completo: false, raw: ok, render: ok, arquivos } as never)).toEqual(["page:incompleto"]);
    expect(motivosLighthouse({ completo: false, execucoes: [] })).toEqual(["lighthouse:incompleto"]);
  });

  it("execução sem nota e sem erro vira sem-nota", () => {
    const e = { valida: false, erro: null, runtimeError: null };
    expect(motivosLighthouse({ completo: false, execucoes: [e, e] as never })).toEqual(["lighthouse:sem-nota"]);
  });
});

describe("estadoDoSite + etapasPendentes (fixtures em raw-retomada/)", () => {
  it("site sem pasta: tudo pendente, sem registro", () => {
    const s = estadoDoSite(RAW, "nunca-coletado.ufrn.br");
    expect(s).toEqual({ id: "nunca-coletado.ufrn.br", page: "pendente", lighthouse: "pendente", motivos: [] });
    expect(temRegistro(s)).toBe(false);
    expect(etapasPendentes(s)).toEqual(["page", "lighthouse"]);
  });

  it("só page coletada: falta o lighthouse", () => {
    const s = estadoDoSite(RAW, "so-page.ufrn.br");
    expect(s.page).toBe("completo");
    expect(etapasPendentes(s)).toEqual(["lighthouse"]);
    expect(etapasPendentes(s, ["page"])).toEqual([]);
  });

  it("lighthouse interrompido (lh1.json sem lighthouse.json) é refeito", () => {
    const s = estadoDoSite(RAW, "lh-parcial.ufrn.br");
    expect(s.lighthouse).toBe("pendente");
    expect(etapasPendentes(s)).toEqual(["lighthouse"]);
  });

  it("site completo não tem etapa pendente", () => {
    const s = estadoDoSite(RAW, "completo.ufrn.br");
    expect(s).toMatchObject({ page: "completo", lighthouse: "completo", motivos: [] });
    expect(etapasPendentes(s)).toEqual([]);
  });

  it("site com falha não é tentado de novo (ADR 008) e lista os motivos", () => {
    const s = estadoDoSite(RAW, "falha.ufrn.br");
    expect(s).toMatchObject({ page: "incompleto", lighthouse: "incompleto" });
    expect(etapasPendentes(s)).toEqual([]);
    expect(s.motivos).toEqual([
      "bruto:ECONNREFUSED",
      "render:ERR_CONNECTION_REFUSED",
      "lighthouse:FAILED_DOCUMENT_REQUEST",
      "lighthouse:PROTOCOL_TIMEOUT",
    ]);
  });

  it("registro ilegível não é sobrescrito (regra 8) e vira motivo", () => {
    const s = estadoDoSite(RAW, "ilegivel.ufrn.br");
    expect(s.page).toBe("ilegivel");
    expect(s.motivos).toContain("page:registro-ilegivel");
    expect(etapasPendentes(s)).toEqual(["lighthouse"]);
  });
});

describe("resumirColeta", () => {
  const ids = ["nunca-coletado.ufrn.br", "so-page.ufrn.br", "lh-parcial.ufrn.br", "completo.ufrn.br", "falha.ufrn.br", "ilegivel.ufrn.br"];
  const estados = ids.map((id) => estadoDoSite(RAW, id));

  it("conta completos, com falha e pendentes nas duas etapas", () => {
    const r = resumirColeta(estados);
    expect(r).toMatchObject({ sites: 6, completos: 1, comFalha: 1, pendentes: 4 });
    expect(r.porEtapa.page).toEqual({ pendente: 1, completo: 3, incompleto: 1, ilegivel: 1 });
    expect(r.porEtapa.lighthouse).toEqual({ pendente: 4, completo: 1, incompleto: 1, ilegivel: 0 });
    expect(r.porMotivo).toEqual({
      "bruto:ECONNREFUSED": 1,
      "lighthouse:FAILED_DOCUMENT_REQUEST": 1,
      "lighthouse:PROTOCOL_TIMEOUT": 1,
      "page:registro-ilegivel": 1,
      "render:ERR_CONNECTION_REFUSED": 1,
    });
  });

  it("com --only page, considera só a etapa page", () => {
    const r = resumirColeta(estados, ["page"]);
    expect(r).toMatchObject({ completos: 3, comFalha: 2, pendentes: 1 });
    expect(Object.keys(r.porMotivo).every((m) => !m.startsWith("lighthouse:"))).toBe(true);
  });

  it("ordena motivos por frequência", () => {
    const e = (motivos: string[]) => ({ id: "x", page: "incompleto" as const, lighthouse: "completo" as const, motivos });
    const r = resumirColeta([e(["render:A"]), e(["render:B"]), e(["render:B"])]);
    expect(Object.keys(r.porMotivo)).toEqual(["render:B", "render:A"]);
  });
});

describe("estimarRestanteS", () => {
  it("média dos sites já processados × restantes", () => {
    expect(estimarRestanteS([60_000, 120_000], 10)).toBe(900);
    expect(estimarRestanteS([], 10)).toBeNull();
    expect(estimarRestanteS([60_000], 0)).toBe(0);
  });
});
