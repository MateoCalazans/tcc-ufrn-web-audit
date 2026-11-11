/**
 * Sensibilidade do índice de semântica (S12, ADR 003): pesos propostos ×
 * pesos iguais, pela correlação de Spearman entre os dois rankings. Só lê o
 * `data/processed/dataset.csv` e imprime; não grava nada.
 *
 * Uso: npx tsx scripts/indice-sensibilidade.ts
 */
import { join } from "node:path";

import { postos, spearman } from "../src/analyze/indice.js";
import { readCsvObjects } from "../src/shared/csv.js";

const linhas = readCsvObjects(join("data", "processed", "dataset.csv"));
const num = (v: string | undefined): number | null => (v === undefined || v === "" ? null : Number(v));

const quantis = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => {
    const i = (s.length - 1) * p;
    const lo = Math.floor(i);
    return s[lo]! + (s[Math.ceil(i)]! - s[lo]!) * (i - lo);
  };
  const r = (x: number) => Math.round(x * 100) / 100;
  return { n: s.length, min: r(s[0]!), q1: r(q(0.25)), mediana: r(q(0.5)), q3: r(q(0.75)), max: r(s[s.length - 1]!) };
};
const r3 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);

function comparar(rotulo: string, filtro: (l: Record<string, string>) => boolean) {
  const sel = linhas.filter((l) => filtro(l) && num(l.indice_semantica) !== null && num(l.indice_semantica_pesos_iguais) !== null);
  const a = sel.map((l) => num(l.indice_semantica)!);
  const b = sel.map((l) => num(l.indice_semantica_pesos_iguais)!);
  // Maior deslocamento de posição entre os rankings (posto 1 = maior índice).
  const pa = postos(a.map((x) => -x));
  const pb = postos(b.map((x) => -x));
  const desloc = sel.map((l, k) => ({ id: l.id!, propostos: pa[k]!, iguais: pb[k]!, diferenca: Math.abs(pa[k]! - pb[k]!) }));
  desloc.sort((x, y) => y.diferenca - x.diferenca);
  return {
    rotulo,
    n: sel.length,
    spearman: r3(spearman(a, b)),
    indicePropostos: quantis(a),
    indicePesosIguais: quantis(b),
    deslocamentoDePosicao: quantis(desloc.map((d) => d.diferenca)),
    maioresDeslocamentos: desloc.slice(0, 5),
  };
}

const principal = (l: Record<string, string>) => l.conjunto_principal === "true";
const subnotas = ["landmarks", "titulos", "imagens", "campos", "div_span", "metadados", "interativos", "obsoletos"];
const doPrincipal = linhas.filter((l) => principal(l) && num(l.indice_semantica) !== null);

const out = {
  linhasNoDataset: linhas.length,
  conjuntoPrincipal: linhas.filter(principal).length,
  conjuntoPrincipalComIndice: doPrincipal.length,
  comparacoes: [
    comparar("conjunto principal", principal),
    comparar("conjunto principal sem renderedComRefresh", (l) => principal(l) && l.rendered_com_refresh !== "true"),
  ],
  subnotasNoConjuntoPrincipal: Object.fromEntries(
    subnotas.map((s) => {
      const v = doPrincipal.map((l) => num(l[`sub_${s}`]));
      return [s, { na: v.filter((x) => x === null).length, ...quantis(v.filter((x): x is number => x !== null)) }];
    }),
  ),
};

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
