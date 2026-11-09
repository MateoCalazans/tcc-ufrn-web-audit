/**
 * Classificação do corpus (módulo 0, S04). Funções **puras** sobre o HTML da
 * página inicial (capturado pela sondagem) e o hostname:
 *
 *   - `detectTecnologia(html)` — CMS/framework por assinaturas no HTML.
 *   - `detectTipo(host, titulo)` — tipo de site por palavras-chave no título e
 *     padrões fortes no hostname.
 *
 * Princípio: **não chutar**. Sem sinal claro, o resultado é `outro` (tipo) ou
 * `estatico` (tecnologia = nenhum CMS/framework detectado). Toda decisão vem
 * com a `evidencia` que a sustentou, para a revisão manual (S04) e auditoria.
 */

export type Tecnologia = "wordpress" | "joomla" | "drupal" | "framework-js" | "outro-cms" | "estatico";

export type TipoSite =
  | "evento"
  | "pos-graduacao"
  | "laboratorio"
  | "projeto"
  | "departamento"
  | "unidade"
  | "outro";

export interface Classificacao<T> {
  valor: T;
  /** Sinal que decidiu (ex.: `generator: WordPress 6.4`, `titulo: "laboratório"`). */
  evidencia: string;
}

// ---------------------------------------------------------------------------
// Utilitários de texto
// ---------------------------------------------------------------------------

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
};

/** Acentos das entidades de letra (`&oacute;`, `&ccedil;`…) → diacrítico combinante. */
const DIACRITICOS: Record<string, string> = {
  acute: "́",
  grave: "̀",
  circ: "̂",
  tilde: "̃",
  uml: "̈",
  cedil: "̧",
};

/** Decodifica entidades HTML comuns (básicas, letras acentuadas e numéricas). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
      if (ent[0] === "#") {
        const code = ent[1]?.toLowerCase() === "x" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      const acento = /^([a-z])(acute|grave|circ|tilde|uml|cedil)$/i.exec(ent);
      if (acento) return `${acento[1]}${DIACRITICOS[acento[2]!.toLowerCase()]}`;
      return ENTIDADES[ent.toLowerCase()] ?? m;
    })
    .normalize("NFC");
}

/** Minúsculas, sem acentos, espaços colapsados — para casar palavras-chave. */
export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Conteúdo do primeiro `<title>` (entidades decodificadas), ou `""`. */
export function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return "";
  return decodeEntities(m[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Valor do `<meta name="generator">` (qualquer ordem de atributos), ou `null`. */
export function extractGenerator(html: string): string | null {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\bname\s*=\s*["']?generator\b/i.test(tag)) continue;
    const c = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const v = (c?.[1] ?? c?.[2] ?? c?.[3] ?? "").trim();
    if (v !== "") return decodeEntities(v);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tecnologia
// ---------------------------------------------------------------------------

/**
 * Assinaturas de CMS no corpo (além do `generator`). Ordem = prioridade:
 * CMS vence framework JS (temas WordPress embutem React/Vue com frequência).
 */
const ASSINATURAS_CMS: Array<[Tecnologia, RegExp, string]> = [
  ["wordpress", /\/wp-(?:content|includes)\//i, "wp-content/wp-includes"],
  ["joomla", /\/media\/(?:jui|system|templates)\/|\/components\/com_[a-z]+/i, "caminhos do Joomla"],
  ["drupal", /drupal-settings-json|Drupal\.settings|\/sites\/(?:default|all)\/(?:files|themes|modules)\//i, "assinatura do Drupal"],
];

const ASSINATURAS_JS: Array<[RegExp, string]> = [
  [/id=["']__next["']|__NEXT_DATA__/i, "next.js"],
  [/id=["']__nuxt["']|window\.__NUXT__|\/_nuxt\//i, "nuxt"],
  [/\bng-version=|<app-root\b/i, "angular"],
  [/data-reactroot|<div[^>]+id=["']root["'][^>]*>\s*<\/div>/i, "react"],
  [/<div[^>]+id=["']app["'][^>]*>\s*<\/div>|data-v-[0-9a-f]{8}/i, "vue"],
  [/\bgatsby-/i, "gatsby"],
];

/**
 * Detecta a tecnologia da página. Prioridade:
 *   1. `generator` que nomeia WordPress/Joomla/Drupal;
 *   2. assinaturas de CMS no corpo;
 *   3. frameworks JS (SPA);
 *   4. `generator` presente mas de outra ferramenta → `outro-cms`;
 *   5. nenhum sinal → `estatico` (= "sem CMS/framework detectado").
 */
export function detectTecnologia(html: string): Classificacao<Tecnologia> {
  const generator = extractGenerator(html);
  if (generator !== null) {
    const g = generator.toLowerCase();
    if (g.includes("wordpress")) return { valor: "wordpress", evidencia: `generator: ${generator}` };
    if (g.includes("joomla")) return { valor: "joomla", evidencia: `generator: ${generator}` };
    if (g.includes("drupal")) return { valor: "drupal", evidencia: `generator: ${generator}` };
  }

  for (const [tec, re, rotulo] of ASSINATURAS_CMS) {
    if (re.test(html)) return { valor: tec, evidencia: rotulo };
  }

  for (const [re, rotulo] of ASSINATURAS_JS) {
    if (re.test(html)) return { valor: "framework-js", evidencia: rotulo };
  }

  if (generator !== null) return { valor: "outro-cms", evidencia: `generator: ${generator}` };

  return { valor: "estatico", evidencia: "nenhuma assinatura de CMS/framework" };
}

// ---------------------------------------------------------------------------
// Tipo de site
// ---------------------------------------------------------------------------

/**
 * Regras por tipo, em ordem de prioridade (o primeiro que casar vence). A
 * ordem resolve títulos compostos: "Semana de Computação do Departamento X"
 * → evento; "Laboratório Y do Departamento Z" → laboratório; "PPG em X –
 * Centro Y" → pós-graduação. Padrões casam sobre texto já dobrado
 * (`foldText`: sem acento, minúsculo).
 */
interface RegraTipo {
  tipo: Exclude<TipoSite, "outro">;
  titulo: RegExp[];
  host: RegExp[];
}

const REGRAS_TIPO: RegraTipo[] = [
  {
    tipo: "evento",
    titulo: [
      /\b(congresso|seminario|simposio|coloquio|workshop|conferencia|jornada|festival|mostra)\b/,
      /\bsemana (de|da|do|academica|universitaria)\b/,
      /\bencontro (de|da|do|nacional|regional|internacional|norte|nordeste)\b/,
      /\b(forum|feira|olimpiada|escola de verao|escola de inverno)\b/,
    ],
    host: [
      /(congresso|seminario|simposio|coloquio|workshop|semana|jornada|encontro|forum)/,
      /(^|[.-])(19|20)\d{2}($|[.-])/, // ano no host (ex.: sbsi2019, evento-2023)
      /(19|20)\d{2}\.ufrn\.br$/,
    ],
  },
  {
    tipo: "pos-graduacao",
    titulo: [
      /\bpos[- ]?graduacao\b/,
      /\b(mestrado|doutorado)\b/,
      /\bprograma de pos\b/,
      /\bppg[a-z]*\b/, // sigla padrão dos programas na UFRN (PPgSW, PPGEd…)
    ],
    host: [/^pp[a-z]{2,}\./, /^(mestrado|doutorado|posgrad)/],
  },
  {
    tipo: "laboratorio",
    titulo: [/\blaboratorio\b/, /^lab\b/],
    host: [/^lab[a-z0-9-]*\./],
  },
  {
    tipo: "projeto",
    titulo: [/\bprojeto\b/],
    host: [/^projeto/],
  },
  {
    tipo: "departamento",
    titulo: [/\bdepartamento\b/],
    host: [/^dep(to|artamento)?[a-z]*\./],
  },
  {
    tipo: "unidade",
    titulo: [
      /\b(centro|escola|instituto|faculdade) (de|da|do|multidisciplinar)\b/,
      /\bpro[- ]?reitoria\b/,
      /\b(superintendencia|secretaria|diretoria|reitoria)\b/,
      /\bunidade academica\b/,
      /\b(biblioteca|museu|hospital|maternidade|editora)\b/,
    ],
    host: [],
  },
];

/**
 * Classifica o tipo do site por **título primeiro, hostname depois**: o título
 * é escrito pela própria unidade e é mais confiável que siglas no host.
 * Sem sinal → `outro` (sem chute; ex.: "Núcleo", siglas opacas).
 */
export function detectTipo(host: string, titulo: string): Classificacao<TipoSite> {
  const t = foldText(titulo);
  if (t !== "") {
    for (const regra of REGRAS_TIPO) {
      for (const re of regra.titulo) {
        const m = re.exec(t);
        if (m) return { valor: regra.tipo, evidencia: `titulo: "${m[0]}"` };
      }
    }
  }

  const h = host.toLowerCase();
  for (const regra of REGRAS_TIPO) {
    for (const re of regra.host) {
      if (re.test(h)) return { valor: regra.tipo, evidencia: `host: ${re.source}` };
    }
  }

  return { valor: "outro", evidencia: t === "" ? "sem título" : "nenhuma palavra-chave" };
}
