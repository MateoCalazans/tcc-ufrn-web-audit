import { describe, expect, it } from "vitest";

import { filtrar, ordenar, valores, FILTRO_INICIAL } from "../src/lib/corpus";
import { faixaLighthouse, fmtBytes, fmtCls, fmtIndice, fmtMs, numero } from "../src/lib/formato";
import { eventosParaMostrar, progresso } from "../src/lib/progresso";
import { agruparPorRegra, agruparPorSeveridade, diferencaLadoALado, linhasDoDiff, resumoMensagem } from "../src/lib/recomendacoes";
import { GEOMETRIA_GRANDE, dadosDoMapa, escala, mediana } from "../src/lib/mapa";
import { lerRota, link } from "../src/lib/rotas";
import { GRUPOS_VALIDACAO, dentroDaVariacao, efeito } from "../src/lib/validacao";
import type { Evento, LinhaCorpus, Recomendacao, ResumoValidacao } from "../src/tipos";

describe("formato", () => {
  it("números pt-BR e vazios", () => {
    expect(numero("")).toBeNull();
    expect(numero("49")).toBe(49);
    expect(numero("abc")).toBeNull();
    expect(fmtIndice(60.725)).toBe("60,7");
    expect(fmtIndice(null)).toBe("—");
    expect(fmtMs(379)).toBe("379 ms");
    expect(fmtMs(13492.1)).toBe("13,5 s");
    expect(fmtCls(0.124549)).toBe("0,125");
    expect(fmtBytes(2240316)).toBe("2,1 MiB");
    expect(fmtBytes(181977)).toBe("177,7 KiB");
  });

  it("faixas do Lighthouse: 0–49, 50–89, 90–100", () => {
    expect(faixaLighthouse(49)).toBe("ruim");
    expect(faixaLighthouse(50)).toBe("media");
    expect(faixaLighthouse(89)).toBe("media");
    expect(faixaLighthouse(90)).toBe("boa");
    expect(faixaLighthouse(null)).toBeNull();
  });
});

describe("lista do corpus", () => {
  const l = (id: string, x: Partial<LinhaCorpus>): LinhaCorpus => ({ id, tipo: "outro", tecnologia: "estatico", conjunto_principal: "true", ...x });
  const linhas = [
    l("b.ufrn.br", { indice_semantica: "60", tecnologia: "wordpress" }),
    l("a.ufrn.br", { indice_semantica: "", conjunto_principal: "false" }),
    l("c.ufrn.br", { indice_semantica: "20", tipo: "evento" }),
    l("d.ufrn.br", { indice_semantica: "60" }),
  ];

  it("filtra por texto, tipo, tecnologia e conjunto principal", () => {
    expect(filtrar(linhas, { ...FILTRO_INICIAL, texto: " C.UFRN " }).map((x) => x.id)).toEqual(["c.ufrn.br"]);
    expect(filtrar(linhas, { ...FILTRO_INICIAL, tipo: "evento" }).map((x) => x.id)).toEqual(["c.ufrn.br"]);
    expect(filtrar(linhas, { ...FILTRO_INICIAL, tecnologia: "wordpress" }).map((x) => x.id)).toEqual(["b.ufrn.br"]);
    expect(filtrar(linhas, { ...FILTRO_INICIAL, soPrincipal: true })).toHaveLength(3);
  });

  it("ordena números com vazios no fim nas duas direções, empate pelo id", () => {
    expect(ordenar(linhas, { chave: "indice_semantica", direcao: "asc" }).map((x) => x.id)).toEqual(["c.ufrn.br", "b.ufrn.br", "d.ufrn.br", "a.ufrn.br"]);
    expect(ordenar(linhas, { chave: "indice_semantica", direcao: "desc" }).map((x) => x.id)).toEqual(["b.ufrn.br", "d.ufrn.br", "c.ufrn.br", "a.ufrn.br"]);
    expect(ordenar(linhas, { chave: "id", direcao: "desc" }).map((x) => x.id)).toEqual(["d.ufrn.br", "c.ufrn.br", "b.ufrn.br", "a.ufrn.br"]);
    expect(linhas[0]!.id).toBe("b.ufrn.br"); // não muda a entrada
  });

  it("valores distintos para os filtros", () => {
    expect(valores(linhas, "tecnologia")).toEqual(["estatico", "wordpress"]);
  });
});

describe("recomendações", () => {
  const r = (id: string, severidade: Recomendacao["severidade"], correcaoAutomatica = false): Recomendacao => ({
    id,
    regra: id.replace(/-\d+$/, ""),
    severidade,
    dimensao: "performance",
    evidencia: "",
    posicao: null,
    correcaoAutomatica,
    mensagem: "",
  });

  it("agrupa por severidade, alta primeiro, corrigidas antes, sem grupo vazio", () => {
    const g = agruparPorSeveridade([r("img-lazy-1", "baixa"), r("html-lang-1", "alta"), r("img-lazy-2", "baixa", true), r("x-1", "info")]);
    expect(g.map((x) => x.severidade)).toEqual(["alta", "baixa", "info"]);
    expect(g[1]!.itens.map((x) => x.id)).toEqual(["img-lazy-2", "img-lazy-1"]);
  });

  it("diferença lado a lado: só o miolo muda", () => {
    expect(diferencaLadoALado("<img src=a>", '<img loading="lazy" src=a>')).toEqual({
      antes: [
        { texto: "<img ", tipo: "igual" },
        { texto: "src=a>", tipo: "igual" },
      ],
      depois: [
        { texto: "<img ", tipo: "igual" },
        { texto: 'loading="lazy" ', tipo: "inserido" },
        { texto: "src=a>", tipo: "igual" },
      ],
    });
    const troca = diferencaLadoALado("<font>a</font>", "<span>a</span>");
    expect(troca.antes.filter((s) => s.tipo === "removido").map((s) => s.texto)).toEqual(["font>a</font"]);
    expect(troca.depois.filter((s) => s.tipo === "inserido").map((s) => s.texto)).toEqual(["span>a</span"]);
  });

  it("linhas do fix.diff", () => {
    expect(linhasDoDiff("--- a/index.html\n+++ b/fixed.html\n@@ -1 +1 @@\n-x\n+y\n z\n").map((l) => l.tipo)).toEqual([
      "cabecalho",
      "cabecalho",
      "bloco",
      "removida",
      "inserida",
      "contexto",
    ]);
  });
});

describe("progresso", () => {
  const em = "2026-11-16T20:00:00Z";
  it("estado de cada etapa a partir dos eventos", () => {
    const ev: Evento[] = [
      { tipo: "estado", estado: "rodando", em },
      { tipo: "etapa-inicio", etapa: "triagem", rotulo: "", em },
      { tipo: "etapa-fim", etapa: "triagem", codigo: 0, duracaoMs: 538, em },
      { tipo: "etapa-inicio", etapa: "sondagem", rotulo: "", em },
      { tipo: "log", etapa: "sondagem", linha: "robots ok", em },
    ];
    const p = progresso("avulso", ev);
    expect(p.estado).toBe("rodando");
    expect(p.etapas.map((e) => e.situacao)).toEqual(["concluida", "rodando", "pendente", "pendente", "pendente", "pendente"]);
    expect(p.etapas[0]!.duracaoMs).toBe(538);
    expect(p.logs).toEqual(["[sondagem] robots ok"]);
  });

  it("excluída pela triagem: o resto não roda", () => {
    const p = progresso("avulso", [
      { tipo: "etapa-inicio", etapa: "classificacao", rotulo: "", em },
      { tipo: "etapa-fim", etapa: "classificacao", codigo: 0, duracaoMs: 1, em },
      { tipo: "estado", estado: "excluida", motivo: "robots", em },
    ]);
    expect(p).toMatchObject({ estado: "excluida", motivo: "robots" });
    expect(p.etapas.map((e) => e.situacao)).toEqual(["pulada", "pulada", "concluida", "pulada", "pulada", "pulada"]);
  });

  it("análise de outra execução do servidor: etapas vêm do registro em disco", () => {
    const sse: Evento[] = [{ tipo: "estado", estado: "concluida" }];
    const registro: Evento[] = [
      { tipo: "etapa-inicio", etapa: "recomendacao", rotulo: "", em },
      { tipo: "etapa-fim", etapa: "recomendacao", codigo: 0, duracaoMs: 14474, em },
      { tipo: "estado", estado: "concluida", em },
    ];
    expect(eventosParaMostrar(sse, registro)).toBe(registro);
    expect(progresso("corpus", eventosParaMostrar(sse, registro)).etapas[0]!.situacao).toBe("concluida");
    const vivo: Evento[] = [{ tipo: "etapa-inicio", etapa: "triagem", rotulo: "", em }];
    expect(eventosParaMostrar(vivo, registro)).toBe(vivo);
    expect(eventosParaMostrar(sse, undefined)).toBe(sse);
  });

  it("etapa com código diferente de 0 falhou", () => {
    const p = progresso("corpus", [
      { tipo: "etapa-inicio", etapa: "recomendacao", rotulo: "", em },
      { tipo: "etapa-fim", etapa: "recomendacao", codigo: 2, duracaoMs: 10, em },
      { tipo: "estado", estado: "falhou", motivo: "Recomendação terminou com código 2", em },
    ]);
    expect(p.etapas).toEqual([{ etapa: "recomendacao", rotulo: "Recomendação", situacao: "falhou", duracaoMs: 10 }]);
  });
});

describe("rotas", () => {
  it("lê e monta", () => {
    expect(lerRota("")).toEqual({ tela: "lista" });
    expect(lerRota("#/")).toEqual({ tela: "lista" });
    expect(lerRota("#/site/mat.ufrn.br")).toEqual({ tela: "site", id: "mat.ufrn.br" });
    expect(lerRota("#/nova")).toEqual({ tela: "nova" });
    expect(lerRota("#/analise/mat.ufrn.br__2026-11-16T20-00-00")).toEqual({ tela: "analise", id: "mat.ufrn.br__2026-11-16T20-00-00" });
    expect(lerRota("#/site/..%2F..")).toEqual({ tela: "nao-encontrada" });
    expect(lerRota("#/site/%E0%A4%A")).toEqual({ tela: "nao-encontrada" });
    expect(lerRota("#/conteudo")).toEqual({ tela: "nao-encontrada" });
    expect(link({ tela: "site", id: "mat.ufrn.br" })).toBe("#/site/mat.ufrn.br");
  });
});

describe("mapa do corpus", () => {
  const l = (id: string, perf: string, ind: string, principal = "true"): LinhaCorpus => ({
    id,
    nota_performance: perf,
    indice_semantica: ind,
    conjunto_principal: principal,
    tecnologia: "estatico",
  });

  it("só o conjunto principal com as duas medidas, da pior para a melhor performance", () => {
    const d = dadosDoMapa([l("a", "90", "40"), l("b", "20", "70"), l("c", "", "50"), l("d", "50", "60", "false"), l("e", "60", "")]);
    expect(d.pontos.map((p) => p.id)).toEqual(["b", "a"]);
    expect(d.fora).toBe(3);
    expect(d.medianaPerformance).toBe(55);
    expect(d.medianaIndice).toBe(55);
  });

  it("mediana com n ímpar e vazio", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([])).toBeNull();
  });

  it("escala 0–100 para o SVG, com os limites presos", () => {
    const e = escala(GEOMETRIA_GRANDE);
    expect(e.x(0)).toBe(GEOMETRIA_GRANDE.margem.esquerda);
    expect(e.x(100)).toBe(e.direita);
    expect(e.y(100)).toBe(e.topo);
    expect(e.y(-5)).toBe(e.base);
  });
});

describe("recomendações recolhidas", () => {
  const r = (id: string, regra: string, correcaoAutomatica = false): Recomendacao => ({
    id,
    regra,
    severidade: "media",
    dimensao: "performance",
    evidencia: "",
    posicao: null,
    correcaoAutomatica,
    mensagem: "",
  });

  it("agrupa por regra na ordem em que aparece, contando as corrigidas", () => {
    const g = agruparPorRegra([r("b-1", "b"), r("a-1", "a", true), r("b-2", "b", true), r("a-2", "a", true)]);
    expect(g.map((x) => [x.regra, x.itens.length, x.corrigidas])).toEqual([
      ["b", 2, 1],
      ["a", 2, 2],
    ]);
  });

  it("resumo do motivo: primeira frase, ou corte numa palavra", () => {
    expect(resumoMensagem("<img> sem width e height: a página se desloca. Acrescentado width.")).toBe("<img> sem width e height: a página se desloca.");
    expect(resumoMensagem("x.y sem ponto final")).toBe("x.y sem ponto final");
    const longa = "palavra ".repeat(30).trim();
    const res = resumoMensagem(longa, 40);
    expect(res.endsWith("…")).toBe(true);
    expect(res.length).toBeLessThanOrEqual(41);
    expect(res).not.toMatch(/palavr…$/);
  });
});

describe("validação: efeito de cada métrica", () => {
  const c = (delta: number | null) => ({ original: 1, corrigido: 1, delta });
  it("pelo sentido da métrica", () => {
    expect(efeito(c(2), "maior")).toBe("melhorou");
    expect(efeito(c(-2), "maior")).toBe("piorou");
    expect(efeito(c(-72.5), "menor")).toBe("melhorou");
    expect(efeito(c(0.1256), "menor")).toBe("piorou");
    expect(efeito(c(0), "menor")).toBe("igual");
    expect(efeito(c(null), "maior")).toBe("sem-dado");
    expect(efeito(undefined, "maior")).toBe("sem-dado");
  });

  const v = (delta: number | null, a1: number | null, a2: number | null) =>
    ({
      deltas: { nota_performance: { original: 60, corrigido: 60, delta } },
      variacao: {
        original: a1 === null ? null : { n: 3, min: 0, max: 0, amplitude: a1 },
        corrigido: a2 === null ? null : { n: 3, min: 0, max: 0, amplitude: a2 },
      },
    }) as unknown as ResumoValidacao;

  it("diferença dentro da maior amplitude das duas variantes", () => {
    expect(dentroDaVariacao(v(1, 1, 0))).toBe(true);
    expect(dentroDaVariacao(v(-3, 1, 2))).toBe(false);
    expect(dentroDaVariacao(v(null, 1, 1))).toBeNull();
    expect(dentroDaVariacao(v(2, null, null))).toBeNull();
  });

  it("toda métrica da tabela tem chave em deltas do módulo 4", () => {
    const chaves = GRUPOS_VALIDACAO.flatMap((g) => g.linhas.map((l) => l.chave));
    expect(chaves).toEqual([
      "nota_performance",
      "nota_accessibility",
      "nota_best_practices",
      "nota_seo",
      "fcp_ms",
      "lcp_ms",
      "tbt_ms",
      "speed_index_ms",
      "cls",
      "peso_total_bytes",
      "requisicoes",
      "indice_semantica",
      "indice_semantica_pesos_iguais",
    ]);
  });
});
