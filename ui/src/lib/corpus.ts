import type { LinhaCorpus } from "../tipos";
import { numero } from "./formato";

/** Colunas da lista dos sites (todas vêm do `dataset.csv`). */
export const COLUNAS = [
  { chave: "id", rotulo: "Site", numerica: false },
  { chave: "tipo", rotulo: "Tipo", numerica: false },
  { chave: "tecnologia", rotulo: "Tecnologia", numerica: false },
  { chave: "nota_performance", rotulo: "Performance", numerica: true },
  { chave: "nota_accessibility", rotulo: "Acessibilidade", numerica: true },
  { chave: "lcp_ms", rotulo: "LCP", numerica: true },
  { chave: "indice_semantica", rotulo: "Índice de semântica", numerica: true },
] as const;

export type ChaveColuna = (typeof COLUNAS)[number]["chave"];

export interface Filtro {
  texto: string;
  tipo: string;
  tecnologia: string;
  /** Só o conjunto principal (ADR 009/012). */
  soPrincipal: boolean;
}

export interface Ordem {
  chave: ChaveColuna;
  direcao: "asc" | "desc";
}

export const FILTRO_INICIAL: Filtro = { texto: "", tipo: "", tecnologia: "", soPrincipal: false };

export function filtrar(linhas: readonly LinhaCorpus[], f: Filtro): LinhaCorpus[] {
  const texto = f.texto.trim().toLowerCase();
  return linhas.filter(
    (l) =>
      (texto === "" || l.id.toLowerCase().includes(texto)) &&
      (f.tipo === "" || l.tipo === f.tipo) &&
      (f.tecnologia === "" || l.tecnologia === f.tecnologia) &&
      (!f.soPrincipal || l.conjunto_principal === "true"),
  );
}

/** Ordena sem mudar a entrada. Vazios vão sempre para o fim, nas duas direções. */
export function ordenar(linhas: readonly LinhaCorpus[], o: Ordem): LinhaCorpus[] {
  const col = COLUNAS.find((c) => c.chave === o.chave)!;
  const sinal = o.direcao === "asc" ? 1 : -1;
  return [...linhas].sort((a, b) => {
    if (col.numerica) {
      const x = numero(a[o.chave]);
      const y = numero(b[o.chave]);
      if (x === null || y === null) return x === y ? a.id.localeCompare(b.id) : x === null ? 1 : -1;
      return (x - y) * sinal || a.id.localeCompare(b.id);
    }
    const x = a[o.chave] ?? "";
    const y = b[o.chave] ?? "";
    if (x === "" || y === "") return x === y ? 0 : x === "" ? 1 : -1;
    return x.localeCompare(y, "pt-BR") * sinal || a.id.localeCompare(b.id);
  });
}

/** Valores distintos de uma coluna, para as opções do filtro. */
export function valores(linhas: readonly LinhaCorpus[], chave: string): string[] {
  return [...new Set(linhas.map((l) => l[chave] ?? "").filter((v) => v !== ""))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
