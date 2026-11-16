// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Notas } from "../src/componentes/Notas";
import { Recomendacoes } from "../src/componentes/Recomendacoes";
import type { Metricas, Recomendacao } from "../src/tipos";

afterEach(cleanup);

const rec = (x: Partial<Recomendacao> & Pick<Recomendacao, "id" | "regra">): Recomendacao => ({
  severidade: "media",
  dimensao: "performance",
  evidencia: "<img src=a.png>",
  posicao: { linha: 3, coluna: 1 },
  correcaoAutomatica: false,
  mensagem: "motivo",
  ...x,
});

describe("Recomendacoes", () => {
  const dados = {
    regras: [{ id: "img-dimensions", dimensao: "performance" as const, descricao: "Toda <img> declara width e height." }],
    recommendations: [
      rec({ id: "img-dimensions-1", regra: "img-dimensions", correcaoAutomatica: true, mensagem: "sem width e height. Acrescentado width." }),
      rec({ id: "img-dimensions-2", regra: "img-dimensions", posicao: { linha: 9, coluna: 1 } }),
      rec({ id: "html-lang-1", regra: "html-lang", severidade: "alta", dimensao: "semantica" }),
    ],
  };
  const trechos = { "img-dimensions-1": { linha: 3, antes: "<img src=a.png>", depois: '<img src=a.png width="1">', cortadoInicio: false, cortadoFim: false } };

  it("recolhido: severidade, uma linha por regra com a contagem, sem os detalhes", () => {
    render(<Recomendacoes dados={dados} trechos={trechos} fixDiff={"--- a/index.html\n+++ b/fixed.html\n"} origem="geradas no TCC" />);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Severidade alta (1)", "Severidade média (2)"]);
    expect(screen.getByText("2 ocorrências, 1 corrigida automaticamente")).toBeTruthy();
    expect(screen.getByText("1 ocorrência, sem correção automática")).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.getByText(/3 recomendações, 1 com correção automática/)).toBeTruthy();
  });

  it("abrir todas mostra motivo, referência, descrição e o diff lado a lado", () => {
    render(<Recomendacoes dados={dados} trechos={trechos} fixDiff={null} origem="geradas no TCC" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir todas" }));
    const item = screen.getByRole("article", { name: "img-dimensions, linha 3" });
    expect(within(item).getByText("sem width e height. Acrescentado width.")).toBeTruthy();
    expect(within(item).getByText("Antes, em index.html (linha 3)")).toBeTruthy();
    expect(item.querySelector("ins")?.textContent).toBe(' width="1"');
    // uma vez por regra (html-lang e img-dimensions são do ADR 014), não por ocorrência
    expect(screen.getAllByText(/Referência: ADR 014/)).toHaveLength(2);
    expect(screen.getByText("Toda <img> declara width e height.")).toBeTruthy();
    expect(screen.getByRole("article", { name: "img-dimensions, linha 9" }).querySelector(".diff-lados")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Fechar todas" }));
    expect(screen.getByRole("button", { name: "Fechar todas" }).hasAttribute("disabled")).toBe(true);
  });

  it("só com correção automática", () => {
    render(<Recomendacoes dados={dados} trechos={trechos} fixDiff={null} origem="geradas no TCC" />);
    fireEvent.click(screen.getByLabelText("Só com correção automática"));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Severidade média (1)"]);
    expect(screen.getByText("1 ocorrência, 1 corrigida automaticamente")).toBeTruthy();
  });

  it("sem recomendações, diz isso", () => {
    render(<Recomendacoes dados={{ recommendations: [] }} trechos={{}} fixDiff={null} origem="análise avulsa" />);
    expect(screen.getByText("Nenhuma regra encontrou problema nesta página.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Abrir todas" })).toBeNull();
  });
});

describe("Notas", () => {
  it("índice composto e notas do Lighthouse com a faixa em texto", () => {
    const m: Metricas = {
      id: "mat.ufrn.br",
      url: "https://mat.ufrn.br/",
      performance: { metricas: { notas: { performance: 49, accessibility: 74, "best-practices": 96, seo: null } } },
      indice: { indice: 60.725, indicePesosIguais: 68.13, subnotas: {} },
    };
    render(<Notas m={m} />);
    // o valor aparece para o leitor de tela e no contador visual (aria-hidden)
    expect(screen.getAllByText("60,7")).toHaveLength(2);
    expect(screen.getByText(/Com pesos iguais, ficaria em 68,1/)).toBeTruthy();
    expect(screen.getAllByText("Faixa ruim no Lighthouse")).toHaveLength(1);
    expect(screen.getByText("Faixa boa no Lighthouse")).toBeTruthy();
    expect(screen.getByText("Sem nota do Lighthouse")).toBeTruthy();
  });
});

describe("ListaCorpus", () => {
  it("filtro e ordenação pela tabela", async () => {
    const linhas = [
      { id: "b.ufrn.br", tipo: "evento", tecnologia: "wordpress", conjunto_principal: "true", indice_semantica: "50", nota_performance: "40" },
      { id: "a.ufrn.br", tipo: "outro", tecnologia: "estatico", conjunto_principal: "true", indice_semantica: "70", nota_performance: "95" },
    ];
    globalThis.fetch = (async () => new Response(JSON.stringify(linhas), { status: 200 })) as typeof fetch;
    const { ListaCorpus } = await import("../src/telas/ListaCorpus");
    render(<ListaCorpus />);
    const tabela = await screen.findByRole("table");
    const ids = () => within(tabela).getAllByRole("rowheader").map((c) => c.textContent);
    expect(ids()).toEqual(["b.ufrn.br", "a.ufrn.br"]); // índice crescente

    fireEvent.click(within(tabela).getByRole("button", { name: /Performance/ }));
    expect(ids()).toEqual(["b.ufrn.br", "a.ufrn.br"]);
    fireEvent.click(within(tabela).getByRole("button", { name: /Performance/ }));
    expect(ids()).toEqual(["a.ufrn.br", "b.ufrn.br"]);
    expect(within(tabela).getByRole("columnheader", { name: /Performance/ }).getAttribute("aria-sort")).toBe("descending");

    fireEvent.change(screen.getByLabelText("Tecnologia"), { target: { value: "wordpress" } });
    expect(ids()).toEqual(["b.ufrn.br"]);
    expect(screen.getByText("1 de 2 sites")).toBeTruthy();
  });
});
