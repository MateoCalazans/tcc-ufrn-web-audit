import { createTwoFilesPatch, FILE_HEADERS_ONLY } from "diff";

import type { Dimensao, Edicao, Har, Recommendation, Rule } from "../shared/types.js";
import { parsear } from "./html.js";

/**
 * Motor de recomendação (S14, ADR 014). Função pura: recebe o HTML de
 * entrada e as regras, devolve as recomendações, o HTML corrigido e o diff
 * unificado. Não lê nem grava em disco.
 */

export interface EntradaMotor {
  siteId: string;
  url: string;
  html: string;
  har?: Har;
}

export interface ResultadoMotor {
  recommendations: Recommendation[];
  fixedHtml: string;
  /** Diff unificado `a/index.html` → `b/fixed.html`; vazio se nada mudou. */
  diff: string;
  resumo: Resumo;
}

export interface Resumo {
  total: number;
  corrigidas: number;
  porRegra: Record<string, { total: number; corrigidas: number }>;
  porDimensao: Record<Dimensao, number>;
}

/** Duas edições conflitam se os intervalos se cruzam ou se inserem no mesmo ponto. */
export function conflitam(a: Edicao, b: Edicao): boolean {
  if (a.inicio < b.fim && b.inicio < a.fim) return true;
  return a.inicio === b.inicio && (a.inicio === a.fim || b.inicio === b.fim);
}

/** Aplica edições já sem conflito, de trás para frente (as posições valem no texto original). */
export function aplicarEdicoes(html: string, edicoes: Edicao[]): string {
  let out = html;
  for (const e of [...edicoes].sort((x, y) => y.inicio - x.inicio)) {
    out = out.slice(0, e.inicio) + e.texto + out.slice(e.fim);
  }
  return out;
}

export async function aplicarRegras(entrada: EntradaMotor, regras: readonly Rule[]): Promise<ResultadoMotor> {
  const { html } = entrada;
  const ctx = { ...entrada, $: parsear(html) };
  const aceitas: Array<{ edicao: Edicao; dono: string }> = [];
  const recommendations: Recommendation[] = [];

  for (const regra of regras) {
    const achados = await regra.avaliar(ctx);
    achados.forEach((a, i) => {
      const id = `${regra.id}-${i + 1}`;
      let mensagem = a.mensagem;
      let edicoes = a.edicoes;
      const invalida = edicoes.find((e) => !(e.inicio >= 0 && e.inicio <= e.fim && e.fim <= html.length));
      if (invalida !== undefined) throw new Error(`regra ${regra.id} gerou edição fora do texto: ${JSON.stringify(invalida)}`);
      const choque = aceitas.find((x) => edicoes.some((e) => conflitam(e, x.edicao)));
      if (choque !== undefined) {
        mensagem += ` (correção não aplicada: conflita com ${choque.dono})`;
        edicoes = [];
      }
      for (const e of edicoes) aceitas.push({ edicao: e, dono: id });
      recommendations.push({
        id,
        regra: regra.id,
        severidade: a.severidade,
        dimensao: a.dimensao,
        evidencia: a.evidencia,
        posicao: a.posicao,
        correcaoAutomatica: edicoes.length > 0,
        mensagem,
        edicoes,
      });
    });
  }

  const fixedHtml = aplicarEdicoes(html, aceitas.map((x) => x.edicao));
  const diff = fixedHtml === html ? "" : createTwoFilesPatch("a/index.html", "b/fixed.html", html, fixedHtml, "", "", { context: 3, headerOptions: FILE_HEADERS_ONLY });
  return { recommendations, fixedHtml, diff, resumo: resumir(regras, recommendations) };
}

function resumir(regras: readonly Rule[], recs: Recommendation[]): Resumo {
  const porRegra: Resumo["porRegra"] = {};
  for (const r of regras) porRegra[r.id] = { total: 0, corrigidas: 0 };
  const porDimensao: Record<Dimensao, number> = { performance: 0, semantica: 0 };
  for (const r of recs) {
    porRegra[r.regra]!.total++;
    if (r.correcaoAutomatica) porRegra[r.regra]!.corrigidas++;
    porDimensao[r.dimensao]++;
  }
  return { total: recs.length, corrigidas: recs.filter((r) => r.correcaoAutomatica).length, porRegra, porDimensao };
}
