/**
 * Extração e conferência das referências citadas em `docs/artigo/rastreabilidade.md`
 * (S19): caminhos entre crases, links Markdown, ADRs e tags. Puro: a existência
 * no disco/git é injetada pelo chamador.
 */

export type TipoReferencia = "caminho" | "nome" | "padrao" | "link" | "adr" | "tag";

export interface Referencia {
  tipo: TipoReferencia;
  /** Texto como aparece no Markdown. */
  valor: string;
  /** Linha (1-based) onde aparece. */
  linha: number;
}

const EXTENSOES = /\.(ts|js|mjs|md|csv|json|jsonl|ipynb|png|svg|sha256|txt|html|zip|diff|har)$/i;

/** Classifica um trecho entre crases; `null` se não parece arquivo. */
export function classificarTrecho(t: string): TipoReferencia | null {
  if (/\s/.test(t) || t.startsWith("--") || t.includes("://")) return null;
  const temPadrao = /[<>*]/.test(t);
  if (t.includes("/")) {
    if (!EXTENSOES.test(t) && !t.endsWith("/")) return null;
    return temPadrao ? "padrao" : "caminho";
  }
  if (EXTENSOES.test(t) && !temPadrao) return "nome";
  return null;
}

export function extrairReferencias(md: string): Referencia[] {
  const refs: Referencia[] = [];
  const vistos = new Set<string>();
  const add = (tipo: TipoReferencia, valor: string, linha: number) => {
    const k = `${tipo}|${valor}`;
    if (vistos.has(k)) return;
    vistos.add(k);
    refs.push({ tipo, valor, linha });
  };
  md.split(/\r?\n/).forEach((texto, i) => {
    const linha = i + 1;
    // links Markdown primeiro, e tirados do texto para não contar o alvo duas vezes
    let resto = texto.replace(/\[[^\]]*\]\(([^)\s]+)\)/g, (_m, alvo: string) => {
      if (!/^[a-z]+:/i.test(alvo) && !alvo.startsWith("#")) add("link", alvo.split("#")[0]!, linha);
      return " ";
    });
    resto = resto.replace(/`([^`]+)`/g, (_m, t: string) => {
      const tipo = classificarTrecho(t);
      if (tipo) add(tipo, t, linha);
      return " ";
    });
    for (const m of texto.matchAll(/ADRs?\s+((?:\d{3})(?:\s*(?:,|e)\s*\d{3})*)/g)) {
      for (const n of m[1]!.match(/\d{3}/g) ?? []) add("adr", n, linha);
    }
    for (const m of texto.matchAll(/\btag\s+`?(v\d[\w.-]*\w)`?/g)) add("tag", m[1]!, linha);
  });
  return refs;
}

export type Situacao = "ok" | "fora-do-git" | "ambiguo" | "ausente";

export interface Conferencia extends Referencia {
  situacao: Situacao;
  /** Caminho resolvido (para nomes soltos, padrões e links). */
  resolvido?: string;
  detalhe?: string;
}

export interface Contexto {
  /** Arquivos versionados (git ls-files), caminhos com `/`. */
  versionados: readonly string[];
  /** Arquivos presentes no disco (inclui os fora do git), caminhos com `/`. */
  noDisco: readonly string[];
  tags: readonly string[];
  adrs: readonly string[];
  /** Diretório do Markdown conferido, para resolver links relativos (ex.: `docs/artigo`). */
  dirBase: string;
}

function normalizar(p: string): string {
  const partes: string[] = [];
  for (const s of p.replace(/\\/g, "/").split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") partes.pop();
    else partes.push(s);
  }
  return partes.join("/");
}

function situacaoDoCaminho(p: string, ctx: Contexto): Situacao {
  const dir = p.endsWith("/");
  // diretório só com `.gitkeep` no git (ex.: `data/raw/`) não conta como versionado
  const tem = (lista: readonly string[]) =>
    dir ? lista.some((f) => f.startsWith(p) && !f.endsWith("/.gitkeep")) : lista.includes(p);
  if (tem(ctx.versionados)) return "ok";
  if (tem(ctx.noDisco)) return "fora-do-git";
  return "ausente";
}

/** Prefixo fixo de um padrão (`data/processed/sites/<id>/x.json` → `data/processed/sites/`). */
export function prefixoDoPadrao(p: string): string {
  const i = p.search(/[<>*]/);
  const antes = p.slice(0, i);
  return antes.slice(0, antes.lastIndexOf("/") + 1);
}

/** Padrão de arquivo casa o caminho inteiro; padrão de diretório (termina em `/`) casa o prefixo. */
export function padraoParaRegex(p: string): RegExp {
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const corpo = esc.replace(/<[^>]+>/g, "[^/]+").replace(/\*/g, "[^/]*");
  return new RegExp(`^${corpo}${p.endsWith("/") ? "" : "$"}`);
}

export function conferir(ref: Referencia, ctx: Contexto): Conferencia {
  switch (ref.tipo) {
    case "caminho":
      return { ...ref, situacao: situacaoDoCaminho(ref.valor, ctx) };
    case "link": {
      const alvo = normalizar(`${ctx.dirBase}/${ref.valor}`);
      return { ...ref, resolvido: alvo, situacao: situacaoDoCaminho(alvo, ctx) };
    }
    case "padrao": {
      const re = padraoParaRegex(ref.valor);
      const v = ctx.versionados.filter((f) => re.test(f));
      const d = ctx.noDisco.filter((f) => re.test(f));
      const situacao: Situacao = v.length > 0 ? "ok" : d.length > 0 ? "fora-do-git" : "ausente";
      return { ...ref, situacao, detalhe: `${v.length} versionados, ${d.length} no disco` };
    }
    case "nome": {
      // Nome solto: ambíguo se casar com mais de um arquivo, versionado ou não
      // (ex.: `fixed.html` existe por site e numa fixture de teste).
      const fim = (f: string) => f === ref.valor || f.endsWith(`/${ref.valor}`);
      const achados = [...new Set([...ctx.versionados.filter(fim), ...ctx.noDisco.filter(fim)])];
      if (achados.length === 0) return { ...ref, situacao: "ausente" };
      if (achados.length > 1) return { ...ref, situacao: "ambiguo", detalhe: `${achados.length} arquivos` };
      const situacao: Situacao = ctx.versionados.includes(achados[0]!) ? "ok" : "fora-do-git";
      return { ...ref, situacao, resolvido: achados[0]! };
    }
    case "adr":
      return { ...ref, situacao: ctx.adrs.includes(ref.valor) ? "ok" : "ausente" };
    case "tag":
      return { ...ref, situacao: ctx.tags.includes(ref.valor) ? "ok" : "ausente" };
  }
}
