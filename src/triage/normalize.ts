/**
 * Normalização da lista de domínios (módulo 0, S02). Funções puras: recebem
 * texto/listas e devolvem objetos — sem IO, fáceis de testar. O runner que lê
 * o arquivo e grava `data/interim/normalized.csv` fica em `index.ts`.
 *
 * Etapas do funil (CLAUDE.md / ADR 002):
 *   linhas → únicos (case/espaço) → unificados (www, edu.br, malformados) →
 *   após filtro (remoção de infraestrutura/homologação).
 */

/** Domínio registrável alvo; tudo é normalizado para terminar assim. */
const REGISTRABLE = "ufrn.br";

/**
 * Rótulos de subdomínio que indicam infraestrutura ou ambiente de
 * homologação/teste (ADR 002). Lista **configurável** — alterá-la muda o
 * corpus, então cada descarte grava o padrão casado em `normalized.csv` para
 * auditoria. Casada por rótulo do hostname (não por substring), aceitando um
 * sufixo numérico (ex.: `ns1`, `api2`) para não confundir com nomes que só
 * contêm o padrão (ex.: `apito` não casa `api`).
 */
export const INFRA_LABELS: readonly string[] = [
  // Rede / serviços de infraestrutura
  "dns",
  "ns",
  "ldap",
  "mta",
  "smtp",
  "imap",
  "pop",
  "mx",
  "proxy",
  "vpn",
  "gw",
  "ftp",
  "ntp",
  "ssh",
  // Servidores / plataformas de serviço (não são sites institucionais)
  "nginx",
  "docker",
  "git",
  // Automação / APIs / endpoints de máquina
  "api",
  "asmx",
  "ws",
  "webservice",
  // Ambientes não-produtivos
  "hml",
  "homolog",
  "homologacao",
  "teste",
  "testes",
  "test",
  "staging",
  "stage",
  "dev",
  "sandbox",
  // Painéis de monitoramento/operação
  "grafana",
  "portainer",
  "kibana",
  "prometheus",
  "zabbix",
  "nagios",
  "cacti",
];

/** Uma linha de entrada e seu destino após a normalização. */
export interface NormalizedRow {
  /** Linha como veio do arquivo (sem alterar). */
  linhaOriginal: string;
  /** Hostname normalizado. */
  hostNormalizado: string;
  situacao: "mantido" | "unificado" | "descartado";
  /** Motivo do descarte (`infra`) ou vazio. */
  motivo: string;
  /** Padrão casado (descarte) ou host de destino (unificação), ou vazio. */
  detalhe: string;
}

export interface Funnel {
  linhas: number;
  unicos: number;
  unificados: number;
  aposFiltro: number;
}

export interface NormalizeResult {
  rows: NormalizedRow[];
  funnel: Funnel;
}

/** Quebra o texto do arquivo em linhas não vazias, preservando a ordem. */
export function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

/**
 * Normaliza um hostname: caixa/espaços, remove esquema/caminho e `www.`,
 * mapeia `.ufrn.edu.br` → `.ufrn.br` e corrige sufixos duplicados
 * (`x.ufrn.br.ufrn.br` → `x.ufrn.br`). Devolve só o hostname.
 */
export function normalizeHost(raw: string): string {
  let h = raw.trim().toLowerCase();
  // Remove esquema e qualquer caminho/porta, caso venha uma URL.
  h = h.replace(/^[a-z]+:\/\//, "");
  h = h.replace(/[/?#].*$/, "");
  h = h.replace(/:\d+$/, "");
  // Remove ponto final e `www.` inicial.
  h = h.replace(/\.$/, "");
  h = h.replace(/^www\./, "");
  // `ufrn.edu.br` → `ufrn.br` (com ou sem subdomínio).
  h = h.replace(/\.ufrn\.edu\.br$/, `.${REGISTRABLE}`);
  h = h.replace(/^ufrn\.edu\.br$/, REGISTRABLE);
  // Sufixo registrável repetido por engano: colapsa para uma ocorrência.
  h = h.replace(/(\.ufrn\.br)(?:\.ufrn\.br)+$/, "$1");
  return h;
}

/** Rótulos de subdomínio (tudo à esquerda de `ufrn.br`). */
function subdomainLabels(host: string): string[] {
  if (host === REGISTRABLE) return [];
  const suffix = `.${REGISTRABLE}`;
  const base = host.endsWith(suffix) ? host.slice(0, -suffix.length) : host;
  return base.split(".").filter((l) => l.length > 0);
}

/**
 * Se o host for de infraestrutura/homologação, devolve o padrão casado;
 * senão `null`. Cada rótulo é dividido em sub-tokens por hífen; um token casa
 * se for igual ao padrão ou padrão + dígitos (ex.: `api`, `api2`, `hml` em
 * `hml-smartenergy`, `teste` em `teste-ipv6`). Evita o falso-positivo de
 * substring (`apito` não casa `api`, pois o token é `apito`).
 */
export function matchInfra(
  host: string,
  patterns: readonly string[] = INFRA_LABELS,
): string | null {
  for (const label of subdomainLabels(host)) {
    for (const token of label.split("-")) {
      for (const p of patterns) {
        if (token === p || new RegExp(`^${p}\\d+$`).test(token)) return p;
      }
    }
  }
  return null;
}

/**
 * Executa o funil completo sobre as linhas já lidas. Emite uma `NormalizedRow`
 * por linha de entrada (ordem preservada), para auditar o destino de cada uma.
 */
export function normalizeList(
  lines: string[],
  patterns: readonly string[] = INFRA_LABELS,
): NormalizeResult {
  const rows: NormalizedRow[] = [];

  // Etapa "únicos": dedup só por caixa/espaço (forma trivial da linha).
  const seenTrivial = new Set<string>();
  // Etapa "unificados": primeiro host normalizado vence; os demais unificam.
  const firstByHost = new Map<string, string>();
  // Hosts já contados como infra (para não descartar o mesmo host 2x no funil).
  const infraHosts = new Set<string>();
  const keptHosts = new Set<string>();

  let unicos = 0;
  let unificados = 0;

  for (const linha of lines) {
    const trivial = linha.trim().toLowerCase();
    const host = normalizeHost(linha);

    if (seenTrivial.has(trivial)) {
      // Duplicata exata da entrada.
      rows.push({
        linhaOriginal: linha,
        hostNormalizado: host,
        situacao: "unificado",
        motivo: "",
        detalhe: firstByHost.get(host) ?? host,
      });
      continue;
    }
    seenTrivial.add(trivial);
    unicos++;

    const first = firstByHost.get(host);
    if (first !== undefined) {
      // Linha diferente que colapsa num host já visto (www/edu.br/malformado).
      rows.push({
        linhaOriginal: linha,
        hostNormalizado: host,
        situacao: "unificado",
        motivo: "",
        detalhe: first,
      });
      continue;
    }
    firstByHost.set(host, host);
    unificados++;

    const infra = matchInfra(host, patterns);
    if (infra !== null) {
      infraHosts.add(host);
      rows.push({
        linhaOriginal: linha,
        hostNormalizado: host,
        situacao: "descartado",
        motivo: "infra",
        detalhe: infra,
      });
      continue;
    }

    keptHosts.add(host);
    rows.push({
      linhaOriginal: linha,
      hostNormalizado: host,
      situacao: "mantido",
      motivo: "",
      detalhe: "",
    });
  }

  return {
    rows,
    funnel: {
      linhas: lines.length,
      unicos,
      unificados,
      aposFiltro: keptHosts.size,
    },
  };
}
