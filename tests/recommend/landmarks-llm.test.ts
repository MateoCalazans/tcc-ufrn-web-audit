import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { landmarks } from "../../src/analyze/semantics.js";
import { parsear } from "../../src/recommend/html.js";
import type { Har } from "../../src/shared/types.js";
import {
  carregarPrompt,
  type ChamarModelo,
  COLUNAS_LLM_RUNS,
  linhaLlmRuns,
  criarRegraLandmarks,
  custoMaximoChamada,
  custoUsd,
  type ExecucaoLlm,
  gastoRegistrado,
  regrasCss,
  seletoresAfetados,
  lerSaida,
  montarEsqueleto,
  type PedidoModelo,
  preencher,
  type RespostaModelo,
} from "../../src/recommend/llm.js";
import { ler, rodar } from "./comum.js";

const prompt = carregarPrompt();

/** Modelo falso: devolve a saída dada e guarda o pedido. */
function falso(saida: unknown, extra: Partial<RespostaModelo> = {}) {
  const pedidos: PedidoModelo[] = [];
  const chamar: ChamarModelo = async (p) => {
    pedidos.push(p);
    return {
      id: "msg_teste",
      modelo: "claude-haiku-5-5",
      stopReason: "end_turn",
      texto: typeof saida === "string" ? saida : JSON.stringify(saida),
      inputTokens: 1000,
      outputTokens: 200,
      ...extra,
    };
  };
  return { chamar: vi.fn(chamar), pedidos };
}

function regra(chamar: ChamarModelo) {
  const execucoes: ExecucaoLlm[] = [];
  return { r: criarRegraLandmarks({ chamar, prompt, registrar: (e) => execucoes.push(e) }), execucoes };
}

const p = (candidato: string, elemento: string, justificativa = "evidência") => ({ candidato, elemento, justificativa });

describe("landmarks-v1 (prompt versionado)", () => {
  it("lê cabeçalho, blocos e esquema do arquivo em docs/prompts", () => {
    expect(prompt.versao).toBe("landmarks-v1");
    expect(prompt.modelo).toBe("claude-haiku-5-5");
    expect(prompt.effort).toBe("low");
    expect(prompt.maxTokens).toBe(4000);
    expect(prompt.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(prompt.sistema).toContain("Nunca invente um identificador");
    for (const k of ["url", "titulo", "presentes", "ausentes", "n", "total", "esqueleto"]) expect(prompt.usuario).toContain(`{{${k}}}`);
    expect(prompt.esquema).toMatchObject({ required: ["propostas"], additionalProperties: false });
  });

  it("placeholder sem valor é erro", () => {
    expect(preencher("a {{x}} b", { x: 1 })).toBe("a 1 b");
    expect(() => preencher("{{y}}", {})).toThrow("{{y}}");
  });
});

describe("montarEsqueleto", () => {
  it("lista os <div> visíveis com conteúdo, dos mais rasos aos mais fundos", () => {
    const e = montarEsqueleto(parsear(ler("landmarks-llm/sem-landmarks.html")));
    expect(e.candidatos.map((c) => `${c.id}:${c.profundidade}:${c.pai ?? "-"}:${c.el.attribs.id ?? c.el.attribs.class}`)).toEqual([
      "c1:0:-:pagina",
      "c2:1:c1:topo",
      "c3:1:c1:conteudo",
      "c4:1:c1:rodape",
      "c5:2:c2:menu",
      "c6:2:c3:noticia",
    ]); // sem o `hidden`, o vazio e o "<div>" dentro do script
    expect(e.elegiveis).toBe(6);
    expect(e.candidatos[1]!.linha).toBe(
      'c2 prof=1 pai=c1 <div id="topo" class="cabecalho"> filhos=[img,h1,div] links=2 títulos=[h1] form=0 img=1 texto="Departamento de Exemplo Início Cursos"',
    );
  });

  it("exclui <div> dentro de secionadores e sem tag de fechamento no arquivo", () => {
    const e = montarEsqueleto(parsear(ler("landmarks-llm/parcial.html")));
    expect(e.candidatos.map((c) => c.el.attribs.id ?? c.el.attribs.class)).toEqual(["cabeca", "sem-fim"]);
  });
});

describe("landmarks-llm (resposta mockada)", () => {
  const html = ler("landmarks-llm/sem-landmarks.html");

  it("troca as tags dos candidatos propostos, sem mudar o texto, e registra tokens e custo", async () => {
    const m = falso({ propostas: [p("c2", "header"), p("c5", "nav"), p("c3", "main"), p("c4", "footer")] });
    const { r, execucoes } = regra(m.chamar);
    const out = await rodar(r, html);

    expect(out.recommendations.map((x) => [x.evidencia, x.correcaoAutomatica])).toEqual([
      ['<div id="topo" class="cabecalho">', true],
      ['<DIV class="menu">', true],
      ['<div id="conteudo">', true],
      ['<div id="rodape">', true],
    ]);
    expect(out.recommendations[0]!.mensagem).toContain("Landmark banner ausente: trocar este <div> por <header>");
    expect(out.fixedHtml).toContain('<header id="topo" class="cabecalho">');
    expect(out.fixedHtml).toContain('<nav class="menu"><ul>');
    expect(out.fixedHtml).toContain("</ul></nav>");
    expect(out.fixedHtml).toContain('<footer id="rodape"><p>Av. Senador Salgado Filho, Natal/RN</p></footer>');
    expect(out.fixedHtml).toContain('<div class="vazio"></div>'); // o resto fica igual
    expect(out.fixedHtml.length - html.length).toBe(2 * (3 + 0 + 1 + 3)); // div→header/nav/main/footer, abertura e fechamento
    expect(landmarks(parsear(out.fixedHtml))).toEqual({ banner: 1, navigation: 1, main: 1, contentinfo: 1 });

    expect(m.pedidos).toHaveLength(1);
    expect(m.pedidos[0]).toMatchObject({ modelo: "claude-haiku-5-5", effort: "low", maxTokens: 4000 });
    expect(m.pedidos[0]!.usuario).toContain("Título: Departamento de Exemplo");
    expect(m.pedidos[0]!.usuario).toContain("Landmarks ausentes (proponha só estes): header, nav, main, footer");
    expect(m.pedidos[0]!.usuario).toContain('c6 prof=2 pai=c3 <div class="noticia">');

    expect(execucoes).toHaveLength(1);
    expect(execucoes[0]).toMatchObject({
      siteId: "exemplo.ufrn.br",
      prompt: "landmarks-v1",
      chamada: true,
      stopReason: "end_turn",
      inputTokens: 1000,
      outputTokens: 200,
      propostas: 4,
      validas: 4,
      rejeitadas: [],
      textoIgual: true,
      erro: null,
    });
    expect(execucoes[0]!.custoUsd).toBeCloseTo(0.0002, 10); // 1000 × 0,10/1M + 200 × 0,50/1M
  });

  it("rejeita candidato inexistente, repetido e acima do limite; nav dentro do header é aceito", async () => {
    const m = falso({
      propostas: [p("c99", "header"), p("c2", "header"), p("c2", "nav"), p("c4", "footer"), p("c6", "footer"), p("c5", "nav")],
    });
    const { r, execucoes } = regra(m.chamar);
    const out = await rodar(r, html);
    expect(out.recommendations.map((x) => x.evidencia)).toEqual(['<div id="topo" class="cabecalho">', '<div id="rodape">', '<DIV class="menu">']);
    expect(out.recommendations.every((x) => x.correcaoAutomatica)).toBe(true);
    expect(execucoes[0]!.rejeitadas).toEqual([
      { candidato: "c99", elemento: "header", motivo: "candidato inexistente" },
      { candidato: "c2", elemento: "nav", motivo: "candidato repetido" },
      { candidato: "c6", elemento: "footer", motivo: "excede o limite de 1 footer" },
    ]);
  });

  it("rejeita aninhamento entre propostas, nos dois sentidos (vale a que veio antes)", async () => {
    for (const [propostas, rejeitada] of [
      [[p("c1", "main"), p("c2", "header")], { candidato: "c2", elemento: "header", motivo: "aninhamento com c1 (main)" }],
      [[p("c2", "header"), p("c1", "main")], { candidato: "c1", elemento: "main", motivo: "aninhamento com c2 (header)" }],
      [[p("c3", "main"), p("c6", "nav")], { candidato: "c6", elemento: "nav", motivo: "aninhamento com c3 (main)" }],
    ] as const) {
      const { r, execucoes } = regra(falso({ propostas }).chamar);
      const out = await rodar(r, html);
      expect(out.recommendations).toHaveLength(1);
      expect(execucoes[0]!.rejeitadas).toEqual([rejeitada]);
    }
  });

  it("propõe só os ausentes: landmark já presente é rejeitado", async () => {
    const m = falso({ propostas: [p("c1", "header"), p("c2", "main"), p("c2", "footer")] });
    const { r, execucoes } = regra(m.chamar);
    const out = await rodar(r, ler("landmarks-llm/parcial.html"));
    expect(m.pedidos[0]!.usuario).toContain("Landmarks já presentes: nav, footer");
    expect(m.pedidos[0]!.usuario).toContain("Landmarks ausentes (proponha só estes): header, main");
    expect(out.recommendations).toHaveLength(2);
    expect(execucoes[0]!.rejeitadas).toEqual([{ candidato: "c2", elemento: "footer", motivo: "landmark já presente ou não pedido" }]);
  });

  it("não chama o modelo quando nenhum landmark falta", async () => {
    const m = falso({ propostas: [] });
    const { r, execucoes } = regra(m.chamar);
    const completo = "<html><body><header>a</header><nav>b</nav><main><div>c</div></main><footer>d</footer></body></html>";
    const out = await rodar(r, completo);
    expect(m.chamar).not.toHaveBeenCalled();
    expect(out.recommendations).toEqual([]);
    expect(execucoes[0]).toMatchObject({ chamada: false, motivo: "nenhum landmark ausente", custoUsd: null });
  });

  it.each([
    ["saída fora do esquema", falso({ propostas: [{ candidato: "c2", elemento: "aside", justificativa: "x" }] }), "saída fora do esquema"],
    ["texto que não é JSON", falso("<header>…</header>"), "saída fora do esquema"],
    ["resposta cortada", falso({ propostas: [] }, { stopReason: "max_tokens" }), "stop_reason max_tokens"],
    ["recusa", falso("", { stopReason: "refusal", texto: null }), "stop_reason refusal"],
  ])("%s: nada é aplicado e o erro fica registrado", async (_, m, erro) => {
    const { r, execucoes } = regra(m.chamar);
    const out = await rodar(r, html);
    expect(out.recommendations).toEqual([]);
    expect(out.fixedHtml).toBe(html);
    expect(execucoes[0]).toMatchObject({ chamada: true, erro });
  });

  it("erro na chamada (rede, 429…) não derruba o motor", async () => {
    const { r, execucoes } = regra(async () => {
      throw new Error("429 rate limit");
    });
    const out = await rodar(r, html);
    expect(out.recommendations).toEqual([]);
    expect(execucoes[0]).toMatchObject({ erro: "chamada: 429 rate limit", inputTokens: 0, custoUsd: null });
  });

  it("teto de gasto: não chama se o gasto + o pior caso da chamada passa do teto", async () => {
    const m = falso({ propostas: [] });
    const execucoes: ExecucaoLlm[] = [];
    const pedidos = (tetoUsd: number, gasto: number) =>
      criarRegraLandmarks({ chamar: m.chamar, prompt, registrar: (e) => execucoes.push(e), orcamento: { tetoUsd, gastoUsd: () => gasto } });
    // Pior caso da saída sozinho: 4000 tokens × US$ 0,50/1M = US$ 0,002.
    await rodar(pedidos(4.5, 4.499), html);
    expect(m.chamar).not.toHaveBeenCalled();
    expect(execucoes[0]).toMatchObject({ chamada: false, motivo: "orçamento esgotado", custoUsd: null });
    await rodar(pedidos(4.5, 1), html);
    expect(m.chamar).toHaveBeenCalledTimes(1);
    expect(execucoes[1]).toMatchObject({ chamada: true, motivo: null });
  });
});

describe("CSS que depende da tag (caso gpc.ect.ufrn.br)", () => {
  const pagina = (head: string) =>
    `<html><head>${head}</head><body><div id="content"><h1>Site em desenvolvimento</h1><p class="info">Escola</p></div></body></html>`;

  it("seletor div#content em <style>: a proposta vira só recomendação", async () => {
    const m = falso({ propostas: [p("c1", "main")] });
    const { r, execucoes } = regra(m.chamar);
    const html = pagina("<style>/* x */ div#content { width: 940px } p.info:hover { color: red }</style>");
    const out = await rodar(r, html);
    expect(out.fixedHtml).toBe(html);
    expect(out.recommendations).toHaveLength(1);
    expect(out.recommendations[0]!.correcaoAutomatica).toBe(false);
    expect(out.recommendations[0]!.mensagem).toContain("o CSS da página seleciona pela tag (div#content)");
    expect(execucoes[0]).toMatchObject({ textoIgual: true, erro: "CSS depende da tag: div#content" });
  });

  it("folha externa vem do HAR (sem rede), com descendente: #pagina div não, div#content p sim", async () => {
    const m = falso({ propostas: [p("c1", "main")] });
    const { r, execucoes } = regra(m.chamar);
    const css = "@media (min-width: 600px) { div#content p { margin: 1em } } .x div { color: red }";
    const har: Har = {
      log: { entries: [{ request: { url: "https://exemplo.ufrn.br/tools/style.css" }, response: { status: 200, content: { text: css } } }] },
    };
    const out = await rodar(r, pagina('<link rel="stylesheet" href="tools/style.css">'), { har });
    expect(out.recommendations[0]!.correcaoAutomatica).toBe(false);
    expect(execucoes[0]!.erro).toBe("CSS depende da tag: div#content p");
  });

  it("sem seletor afetado (classe .main, normalize com display:block) a troca é aplicada", async () => {
    const m = falso({ propostas: [p("c1", "main")] });
    const { r } = regra(m.chamar);
    const html = pagina("<style>main, header, nav { display: block; } .main { color: red } #content h1 { font-size: 2em }</style>");
    const out = await rodar(r, html);
    expect(out.recommendations[0]!.correcaoAutomatica).toBe(true);
    expect(out.fixedHtml).toContain('<main id="content">');
  });

  it("resets (gpc.ect e Eric Meyer) não bloqueiam: declarações neutras ou a regra inteira continua valendo", async () => {
    const m = falso({ propostas: [p("c1", "main")] });
    const { r } = regra(m.chamar);
    const html = pagina(
      "<style>body,div,dl,p { margin:0; padding:0; }" +
        "html, body, div, span, p, main, header, footer, nav { box-sizing: border-box; font: inherit }</style>",
    );
    const out = await rodar(r, html);
    expect(out.recommendations[0]!.correcaoAutomatica).toBe(true);
  });

  it("regrasCss e seletoresAfetados", () => {
    expect(regrasCss("a, b:not(.c, .d) { x: 1 } @font-face { src: x } @media print { div > p { y: 2 } } div { margin: 0px; display: block }")).toEqual([
      { seletores: ["a", "b:not(.c, .d)"] },
      { seletores: ["div > p"] },
    ]);
    const antes = parsear("<body><div id=a><p>x</p></div></body>");
    const depois = parsear("<body><main id=a><p>x</p></main></body>");
    expect(seletoresAfetados(["div:first-child::before { content: '' } main p { a: b } :not(div) > p { c: d } nav { e: f }"], antes, depois)).toEqual([
      "div:first-child::before",
      "main p",
      ":not(div) > p",
    ]);
  });
});

describe("teto de gasto", () => {
  it("pior caso: 1 token a cada 2 caracteres de entrada e max_tokens de saída", () => {
    expect(custoMaximoChamada("claude-haiku-5-5", 20_000, 4000)).toBeCloseTo((10_000 * 0.1 + 4000 * 0.5) / 1e6, 12);
    expect(custoMaximoChamada("outro-modelo", 1, 1)).toBeNull();
  });

  it("gastoRegistrado soma custo_usd do llm-runs.csv (células vazias contam 0)", () => {
    const dir = mkdtempSync(join(tmpdir(), "llm-runs-"));
    const csv = join(dir, "llm-runs.csv");
    expect(gastoRegistrado(csv)).toBe(0);
    const base = (custo: number | null): ExecucaoLlm => ({
      siteId: "a.ufrn.br", prompt: "landmarks-v1", promptSha256: "x", modelo: "claude-haiku-5-5", modeloResposta: null,
      respostaId: null, chamada: true, motivo: null, ausentes: ["main"], candidatos: 1, elegiveis: 1, stopReason: "end_turn",
      inputTokens: 1, outputTokens: 1, custoUsd: custo, propostas: 1, validas: 0,
      rejeitadas: [{ candidato: "c1", elemento: "main", motivo: "vírgula, \"aspas\"" }],
      textoIgual: null, landmarksDepois: null, erro: null, duracaoMs: 1,
    });
    writeFileSync(
      csv,
      [COLUNAS_LLM_RUNS.join(","), linhaLlmRuns(base(0.0012), "d", "g"), linhaLlmRuns(base(null), "d", "g"), linhaLlmRuns(base(0.0003), "d", "g")].join("\n") + "\n",
    );
    expect(gastoRegistrado(csv)).toBeCloseTo(0.0015, 10);
  });
});

describe("linhaLlmRuns", () => {
  it("uma célula por coluna, com escape de aspas e vírgulas", async () => {
    const { r, execucoes } = regra(falso({ propostas: [p("c99", "header", 'diz "topo", no início')] }).chamar);
    await rodar(r, ler("landmarks-llm/sem-landmarks.html"));
    const linha = linhaLlmRuns(execucoes[0]!, "2026-11-16T12:00:00.000Z", "abc123");
    expect(linha.startsWith("2026-11-16T12:00:00.000Z,abc123,exemplo.ufrn.br,landmarks-v1,")).toBe(true);
    expect(linha).toContain(',"[{""candidato"":""c99"",""elemento"":""header"",""motivo"":""candidato inexistente""}]",');
    expect(linha).toContain(",header nav main footer,6,6,end_turn,1000,200,0.0002,1,0,");
    // 23 colunas: conta as vírgulas fora de aspas
    const fora = linha.replace(/"(?:[^"]|"")*"/g, "");
    expect(fora.split(",")).toHaveLength(COLUNAS_LLM_RUNS.length);
  });
});

describe("lerSaida e custoUsd", () => {
  it("aceita só o JSON do esquema", () => {
    expect(lerSaida('{"propostas":[]}')).toEqual([]);
    expect(lerSaida('{"propostas":[{"candidato":"c1","elemento":"main"}]}')).toBeNull();
    expect(lerSaida("[]")).toBeNull();
  });

  it("usa a faixa de preço pelo tamanho do prompt e devolve null para modelo sem preço", () => {
    expect(custoUsd("claude-haiku-5-5", 100_000, 0)).toBeCloseTo(0.01, 10);
    expect(custoUsd("claude-haiku-5-5", 200_000, 1_000_000)).toBeCloseTo(0.1 + 2.5, 10);
    expect(custoUsd("outro-modelo", 1, 1)).toBeNull();
  });
});
