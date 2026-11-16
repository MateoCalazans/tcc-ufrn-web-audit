import { postos } from "../analyze/indice.js";

/**
 * Seleção da amostra do antes/depois (S18, ADR 004). Função pura sobre as
 * linhas do `dataset.csv` e a contagem de correções por site (regras sem LLM).
 *
 *   1. Elegíveis: conjunto principal, fora da lista `excluidos` (sites que a
 *      conferência da S18 mostrou fora do escopo, ex.: tela de login, regra 4),
 *      semântica `ok`, sem meta refresh,
 *      nota de performance e índice presentes, ao menos 1 correção aplicada
 *      e cópia local possível (`index.html` + `page.har`).
 *   2. Grupos de tecnologia do ADR 013 (`joomla` e `outro-cms` → `outro`).
 *   3. "Pior": soma dos postos (crescentes) da nota de performance e do
 *      índice de semântica, calculados entre os elegíveis; menor soma = pior.
 *      Desempate pelo `id`.
 *   4. Por grupo, `porGrupo` sites, escolhidos entre os 2 × `porGrupo` piores
 *      do grupo (janela): o pior primeiro; depois, o pior da janela cujo `tipo`
 *      ainda não está no grupo; sem tipo novo, o pior restante da janela.
 */

export const GRUPOS = ["estatico", "framework-js", "wordpress", "outro"] as const;
export type Grupo = (typeof GRUPOS)[number];

export function grupoDaTecnologia(tecnologia: string): Grupo | null {
  if (tecnologia === "joomla" || tecnologia === "outro-cms") return "outro";
  return (GRUPOS as readonly string[]).includes(tecnologia) ? (tecnologia as Grupo) : null;
}

/** Colunas do `dataset.csv` que a seleção lê (valores como texto, como no CSV). */
export interface LinhaDataset {
  id: string;
  tipo: string;
  tecnologia: string;
  conjunto_principal: string;
  status_semantica: string;
  meta_refresh: string;
  nota_performance: string;
  indice_semantica: string;
}

export interface Candidato {
  id: string;
  tipo: string;
  tecnologia: string;
  grupo: Grupo;
  notaPerformance: number;
  indiceSemantica: number;
  correcoes: number;
  postoPerformance: number;
  postoIndice: number;
  somaPostos: number;
}

export type MotivoInelegivel =
  | "fora-do-conjunto-principal"
  | "excluido-na-validacao"
  | "semantica-nao-ok"
  | "meta-refresh"
  | "sem-nota-ou-indice"
  | "tecnologia-sem-grupo"
  | "sem-copia-local"
  | "sem-correcao";

export interface Selecao {
  elegiveis: Candidato[];
  inelegiveis: Record<MotivoInelegivel, number>;
  amostra: Array<Candidato & { ordemNoGrupo: number }>;
}

const verdadeiro = (s: string) => ["true", "1", "sim"].includes(s.trim().toLowerCase());
const numero = (s: string): number | null => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));

export function selecionarAmostra(params: {
  linhas: readonly LinhaDataset[];
  /** Correções aplicadas pelas regras (sem LLM), por site; ausente = não calculado. */
  correcoes: ReadonlyMap<string, number>;
  /** Sites com `index.html` e `page.har` na coleta. */
  temCopiaLocal: (id: string) => boolean;
  porGrupo: number;
  /** Sites tirados da amostra, com o motivo (ADR 004). */
  excluidos?: ReadonlyMap<string, string>;
}): Selecao {
  const inelegiveis: Record<MotivoInelegivel, number> = {
    "fora-do-conjunto-principal": 0,
    "excluido-na-validacao": 0,
    "semantica-nao-ok": 0,
    "meta-refresh": 0,
    "sem-nota-ou-indice": 0,
    "tecnologia-sem-grupo": 0,
    "sem-copia-local": 0,
    "sem-correcao": 0,
  };
  const base: Array<Omit<Candidato, "postoPerformance" | "postoIndice" | "somaPostos">> = [];
  for (const l of params.linhas) {
    const motivo = ((): MotivoInelegivel | null => {
      if (!verdadeiro(l.conjunto_principal)) return "fora-do-conjunto-principal";
      if (params.excluidos?.has(l.id)) return "excluido-na-validacao";
      if (l.status_semantica !== "ok") return "semantica-nao-ok";
      if (verdadeiro(l.meta_refresh)) return "meta-refresh";
      if (numero(l.nota_performance) === null || numero(l.indice_semantica) === null) return "sem-nota-ou-indice";
      if (grupoDaTecnologia(l.tecnologia) === null) return "tecnologia-sem-grupo";
      if (!params.temCopiaLocal(l.id)) return "sem-copia-local";
      if ((params.correcoes.get(l.id) ?? 0) === 0) return "sem-correcao";
      return null;
    })();
    if (motivo !== null) {
      inelegiveis[motivo]++;
      continue;
    }
    base.push({
      id: l.id,
      tipo: l.tipo,
      tecnologia: l.tecnologia,
      grupo: grupoDaTecnologia(l.tecnologia)!,
      notaPerformance: numero(l.nota_performance)!,
      indiceSemantica: numero(l.indice_semantica)!,
      correcoes: params.correcoes.get(l.id)!,
    });
  }

  const pp = postos(base.map((c) => c.notaPerformance));
  const pi = postos(base.map((c) => c.indiceSemantica));
  const elegiveis: Candidato[] = base
    .map((c, i) => ({ ...c, postoPerformance: pp[i]!, postoIndice: pi[i]!, somaPostos: pp[i]! + pi[i]! }))
    .sort((a, b) => a.somaPostos - b.somaPostos || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const amostra: Selecao["amostra"] = [];
  const janela = 2 * params.porGrupo;
  for (const g of GRUPOS) {
    // Só os `janela` piores do grupo concorrem: o tipo diversifica, mas não puxa um site bom.
    const restantes = elegiveis.filter((c) => c.grupo === g).slice(0, janela);
    const tipos = new Set<string>();
    for (let k = 0; k < params.porGrupo && restantes.length > 0; k++) {
      let i = restantes.findIndex((c) => !tipos.has(c.tipo));
      if (i < 0) i = 0;
      const [c] = restantes.splice(i, 1);
      tipos.add(c!.tipo);
      amostra.push({ ...c!, ordemNoGrupo: k + 1 });
    }
  }
  return { elegiveis, inelegiveis, amostra };
}
