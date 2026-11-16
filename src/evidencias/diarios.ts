/**
 * Leitura das entradas do diário (`docs/diario/AAAA-MM-DD-sNN.md`) para o
 * índice de evidências e o resumo do uso do Claude (S19). Funções puras:
 * recebem o texto do Markdown e devolvem objetos.
 */

/** Categoria normalizada da coluna "Decisão" da tabela de avaliação. */
export type CategoriaDecisao =
  | "aceito"
  | "aceito-inferido"
  | "alterado"
  | "rejeitado"
  | "nao-registrado"
  | "outro";

export const CATEGORIAS: readonly CategoriaDecisao[] = [
  "aceito",
  "aceito-inferido",
  "alterado",
  "rejeitado",
  "nao-registrado",
  "outro",
];

export interface ItemAvaliado {
  item: string;
  decisao: string;
  categoria: CategoriaDecisao;
}

export interface Diario {
  arquivo: string;
  data: string | null;
  sessao: string | null;
  titulo: string | null;
  objetivo: string | null;
  ferramenta: string | null;
  sessaoDoRoteiro: string | null;
  avaliacoes: ItemAvaliado[];
}

/**
 * Normaliza a decisão. "Aceito (inferido)" fica numa categoria própria: são
 * itens que o autor não comentou (o Claude registrou a aceitação por inferência).
 * Outras observações entre parênteses ("Aceito (parâmetros…)") não mudam a categoria.
 * `?` ou vazio = avaliação não registrada (diários S00–S04).
 */
export function categorizar(decisao: string): CategoriaDecisao {
  const d = decisao.trim().toLowerCase();
  if (d === "" || d === "?") return "nao-registrado";
  if (d.startsWith("aceito")) return /\(inferid[oa]\)/.test(d) ? "aceito-inferido" : "aceito";
  if (d.startsWith("alterado")) return "alterado";
  if (d.startsWith("rejeitado")) return "rejeitado";
  return "outro";
}

function celulas(linha: string): string[] {
  const s = linha.trim().replace(/^\|/, "").replace(/\|$/, "");
  return s.split("|").map((c) => c.trim());
}

function campoNegrito(md: string, nome: string): string | null {
  const re = new RegExp(`\\*\\*${nome}:\\*\\*\\s*([^\\n]*)`);
  const m = re.exec(md);
  if (!m) return null;
  // O campo termina no próximo "· **" (cabeçalho com dois campos na mesma linha).
  return m[1]!.split(/\s+·\s+\*\*/)[0]!.trim() || null;
}

/** Linhas da tabela sob o título "## Avaliação do que o Claude produziu". */
export function extrairAvaliacoes(md: string): ItemAvaliado[] {
  const linhas = md.split(/\r?\n/);
  const inicio = linhas.findIndex((l) => /^##\s+Avalia[çc][ãa]o/i.test(l));
  if (inicio < 0) return [];
  const itens: ItemAvaliado[] = [];
  let cabecalho = true;
  for (const l of linhas.slice(inicio + 1)) {
    if (/^##\s/.test(l)) break;
    if (!l.trim().startsWith("|")) continue;
    const c = celulas(l);
    if (cabecalho) {
      // primeira linha = cabeçalho; a seguinte = separador
      if (/^-+$/.test(c[0]?.replace(/:/g, "") ?? "")) cabecalho = false;
      continue;
    }
    if (c.length < 2) continue;
    itens.push({ item: c[0]!, decisao: c[1]!, categoria: categorizar(c[1]!) });
  }
  return itens;
}

export function parseDiario(md: string, arquivo: string): Diario {
  const t = /^#\s+(\d{4}-\d{2}-\d{2})\s+[—-]\s+(S\d+\w*):\s*(.+)$/m.exec(md);
  return {
    arquivo,
    data: t?.[1] ?? null,
    sessao: t?.[2] ?? null,
    titulo: t?.[3]?.trim() ?? null,
    objetivo: campoNegrito(md, "Objetivo"),
    ferramenta: campoNegrito(md, "Ferramenta"),
    sessaoDoRoteiro: campoNegrito(md, "Sessão do roteiro"),
    avaliacoes: extrairAvaliacoes(md),
  };
}

export type Contagem = Record<CategoriaDecisao, number>;

export function contar(itens: ItemAvaliado[]): Contagem {
  const c = Object.fromEntries(CATEGORIAS.map((k) => [k, 0])) as Contagem;
  for (const i of itens) c[i.categoria]++;
  return c;
}

export interface ResumoUso {
  sessoes: number;
  itens: number;
  total: Contagem;
  porSessao: Array<{ sessao: string; arquivo: string; itens: number; contagem: Contagem }>;
  /** Sessões cujas avaliações estão todas como não registradas. */
  sessoesSemRegistro: string[];
}

export function resumirUso(diarios: Diario[]): ResumoUso {
  const todos = diarios.flatMap((d) => d.avaliacoes);
  return {
    sessoes: diarios.length,
    itens: todos.length,
    total: contar(todos),
    porSessao: diarios.map((d) => ({
      sessao: d.sessao ?? d.arquivo,
      arquivo: d.arquivo,
      itens: d.avaliacoes.length,
      contagem: contar(d.avaliacoes),
    })),
    sessoesSemRegistro: diarios
      .filter((d) => d.avaliacoes.length > 0 && d.avaliacoes.every((a) => a.categoria === "nao-registrado"))
      .map((d) => d.sessao ?? d.arquivo),
  };
}
