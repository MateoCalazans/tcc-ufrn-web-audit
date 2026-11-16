/**
 * Interface visual (S20, ADR 017): partes puras do pipeline de uma análise
 * avulsa. Validação da URL, bloqueio de endereços internos, nome da pasta de
 * trabalho, sequência de comandos e saldo da LLM. Nada aqui acessa rede ou disco.
 */
import { isIP } from "node:net";

import { normalizeHost } from "../triage/normalize.js";

// ---------------------------------------------------------------- URL ----

export type ValidacaoUrl =
  | { ok: true; host: string; id: string }
  | { ok: false; motivo: string };

/**
 * Aceita só `http`/`https`, sem credenciais, sem `localhost` e sem IP literal.
 * Devolve o host e o identificador do site (hostname sem `www.`, como na
 * triagem). Caminho, query e fragmento são descartados: só a página inicial (regra 5).
 */
export function validarUrl(entrada: string): ValidacaoUrl {
  const texto = entrada.trim();
  if (texto === "") return { ok: false, motivo: "URL vazia" };
  const comEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(texto) ? texto : `https://${texto}`;
  let url: URL;
  try {
    url = new URL(comEsquema);
  } catch {
    return { ok: false, motivo: "URL inválida" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, motivo: "só http e https" };
  if (url.username !== "" || url.password !== "") return { ok: false, motivo: "URL com credenciais" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const semColchetes = host.replace(/^\[|\]$/g, "");
  if (isIP(semColchetes) !== 0) return { ok: false, motivo: "IP literal não é aceito; use o nome do site" };
  if (host === "localhost" || host.endsWith(".localhost") || !host.includes(".")) {
    return { ok: false, motivo: "endereço local não é aceito" };
  }
  if (/\.(local|internal|lan|home|corp|intranet)$/.test(host)) return { ok: false, motivo: "domínio de rede interna" };
  if (url.port !== "" && url.port !== "80" && url.port !== "443") return { ok: false, motivo: "porta não padrão" };
  const id = normalizeHost(host);
  if (id === "") return { ok: false, motivo: "URL inválida" };
  return { ok: true, host, id };
}

// ---------------------------------------------------- endereços internos --

function ipv4ParaNumero(ip: string): number {
  return ip.split(".").reduce((acc, p) => acc * 256 + Number(p), 0);
}

const FAIXAS_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "esta rede"
  ["10.0.0.0", 8], // privada
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (inclui metadados de nuvem)
  ["172.16.0.0", 12], // privada
  ["192.0.0.0", 24], // IETF
  ["192.0.2.0", 24], // documentação
  ["192.168.0.0", 16], // privada
  ["198.18.0.0", 15], // benchmark
  ["198.51.100.0", 24], // documentação
  ["203.0.113.0", 24], // documentação
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservada + broadcast
];

function v4Bloqueado(ip: string): boolean {
  const n = ipv4ParaNumero(ip);
  return FAIXAS_V4.some(([base, bits]) => {
    const mascara = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((n & mascara) >>> 0) === ((ipv4ParaNumero(base) & mascara) >>> 0);
  });
}

/** Expande um IPv6 em 8 grupos de 16 bits. */
function gruposV6(ip: string): number[] {
  let s = ip.toLowerCase().split("%")[0]!;
  // sufixo IPv4 (ex.: ::ffff:10.0.0.1)
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const n = ipv4ParaNumero(v4[1]!);
    s = s.slice(0, -v4[1]!.length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [esq, dir] = s.includes("::") ? s.split("::") : [s, undefined];
  const a = esq ? esq.split(":").filter(Boolean) : [];
  const b = dir !== undefined && dir !== "" ? dir.split(":") : [];
  const meio = dir !== undefined ? Array(8 - a.length - b.length).fill("0") : [];
  return [...a, ...meio, ...b].map((g) => parseInt(g, 16));
}

/**
 * Verdadeiro se o endereço não é público: privado, loopback, link-local,
 * multicast, reservado ou de documentação (IPv4 e IPv6, inclusive IPv4 mapeado).
 * Endereço que não é IP também é bloqueado.
 */
export function ipBloqueado(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return v4Bloqueado(ip);
  if (v !== 6) return true;
  const g = gruposV6(ip);
  if (g.length !== 8 || g.some((x) => !Number.isFinite(x))) return true;
  const zeros = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeros(8)) return true; // ::
  if (zeros(7) && g[7] === 1) return true; // ::1
  if (zeros(5) && g[5] === 0xffff) return v4Bloqueado(`${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`); // ::ffff:a.b.c.d
  if (zeros(6)) return true; // IPv4-compatível (obsoleto)
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7 (ULA)
  if ((g[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
  if ((g[0]! & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentação
  if (g[0] === 0x2002) return true; // 6to4 (pode embutir IPv4 privado)
  return false;
}

// ------------------------------------------------- pasta e comandos -------

/** `AAAA-MM-DDTHH-MM-SS`, em UTC (seguro para nome de pasta no Windows). */
export function carimbo(d: Date): string {
  return d.toISOString().slice(0, 19).replace(/:/g, "-");
}

export type NomeEtapa = "triagem" | "sondagem" | "classificacao" | "coleta" | "analise" | "recomendacao";

export const ROTULO_ETAPA: Record<NomeEtapa, string> = {
  triagem: "Triagem (normalização)",
  sondagem: "Triagem (DNS, HTTP e robots.txt)",
  classificacao: "Triagem (classificação)",
  coleta: "Coleta (página + Lighthouse 3×)",
  analise: "Análise",
  recomendacao: "Recomendação",
};

export interface Etapa {
  nome: NomeEtapa;
  /** Módulo, relativo à raiz do repositório. */
  modulo: string;
  args: string[];
}

export interface OpcoesAnalise {
  id: string;
  llm: boolean;
  vnu: boolean;
  /** Saldo passado em `--teto-usd` (só com `llm`). */
  tetoUsd: number;
}

/** Sequência de uma análise avulsa (ADR 017, decisão 2). */
export function planoAvulso(o: OpcoesAnalise): Etapa[] {
  return [
    { nome: "triagem", modulo: "src/triage/index.ts", args: [] },
    { nome: "sondagem", modulo: "src/triage/index.ts", args: ["--probe"] },
    { nome: "classificacao", modulo: "src/triage/index.ts", args: ["--classify"] },
    { nome: "coleta", modulo: "src/collect/index.ts", args: ["--site", o.id] },
    { nome: "analise", modulo: "src/analyze/index.ts", args: o.vnu ? ["--vnu"] : [] },
    { nome: "recomendacao", modulo: "src/recommend/index.ts", args: recomendarArgs(o) },
  ];
}

/** Só a recomendação, sobre a cópia do bruto de um site do corpus (ADR 017, decisão 4: sem LLM). */
export function planoCorpus(id: string): Etapa[] {
  return [{ nome: "recomendacao", modulo: "src/recommend/index.ts", args: ["--site", id] }];
}

function recomendarArgs(o: OpcoesAnalise): string[] {
  const a = ["--site", o.id];
  if (o.llm) a.push("--llm", "--teto-usd", o.tetoUsd.toFixed(4));
  return a;
}

// ------------------------------------------------------------- LLM -------

/** Teto do crédito do autor, o mesmo do ADR 016. */
export const TETO_LLM_USD = 4.5;

/** Saldo global: teto menos o gasto do TCC e de todas as análises avulsas. */
export function saldoLlm(gastos: number[], teto = TETO_LLM_USD): number {
  const total = gastos.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  return Math.max(0, teto - total);
}

/** Soma da coluna `custo_usd` de um `llm-runs.csv` já lido. */
export function gastoDoCsv(linhas: Array<Record<string, string>>): number {
  return linhas.reduce((a, l) => a + (Number(l.custo_usd) || 0), 0);
}

// -------------------------------------------------- triagem e coleta ------

export type DesfechoTriagem = { incluido: true; url: string } | { incluido: false; motivo: string };

/** Lê a linha do site no `corpus.csv` da pasta avulsa. */
export function desfechoTriagem(corpus: Array<Record<string, string>>, id: string): DesfechoTriagem {
  const l = corpus.find((r) => r.id === id);
  if (!l) return { incluido: false, motivo: "site não aparece no corpus da triagem" };
  if (l.incluido === "true") return { incluido: true, url: l.url_final?.trim() || `https://${id}/` };
  return { incluido: false, motivo: l.motivo_exclusao?.trim() || "excluído sem motivo registrado" };
}
