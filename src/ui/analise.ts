/**
 * Interface visual (S20, ADR 017): fila de análises e execução das etapas.
 * Cada etapa é um módulo existente rodado como processo filho, com o cwd na
 * pasta da análise (`data/avulsos/<site>/<carimbo>/`). O executor de processos
 * e o DNS são injetados (os testes usam versões simuladas).
 */
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { readCsvObjects } from "../shared/csv.js";
import {
  type Etapa,
  type NomeEtapa,
  ROTULO_ETAPA,
  carimbo,
  desfechoTriagem,
  gastoDoCsv,
  ipBloqueado,
  planoAvulso,
  planoCorpus,
  saldoLlm,
} from "./pipeline.js";

export type Estado = "na-fila" | "rodando" | "concluida" | "excluida" | "recusada" | "falhou";

export type Evento =
  | { tipo: "estado"; estado: Estado; motivo?: string; em: string }
  | { tipo: "etapa-inicio"; etapa: NomeEtapa; rotulo: string; em: string }
  | { tipo: "etapa-fim"; etapa: NomeEtapa; codigo: number; duracaoMs: number; em: string }
  | { tipo: "log"; etapa: NomeEtapa; linha: string; em: string };

export interface Analise {
  /** `<site>__<carimbo>`: também é o nome da pasta, em `data/avulsos/<site>/<carimbo>/`. */
  id: string;
  tipo: "avulso" | "corpus";
  site: string;
  host: string;
  pasta: string;
  opcoes: { llm: boolean; vnu: boolean; tetoUsd: number | null };
  estado: Estado;
  motivo?: string;
  criadaEm: string;
  eventos: Evento[];
}

export type Executor = (etapa: Etapa, cwd: string, onLinha: (linha: string) => void) => Promise<number>;
export type Resolvedor = (host: string) => Promise<string[]>;

export interface Dependencias {
  /** Raiz do repositório. */
  raiz: string;
  executar: Executor;
  resolver: Resolvedor;
  agora: () => Date;
}

/** Linhas de log guardadas por análise (o resto fica no `logs/` da pasta). */
const MAX_LOGS = 400;

export const ID_SITE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
export const ID_ANALISE = /^([a-z0-9.-]+)__(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})$/;

export function pastaDaAnalise(raiz: string, id: string): string | null {
  const m = ID_ANALISE.exec(id);
  if (!m || !ID_SITE.test(m[1]!)) return null;
  return join(raiz, "data", "avulsos", m[1]!, m[2]!);
}

// ------------------------------------------------------- DNS e LLM -------

export type ChecagemDns = { ok: true; enderecos: string[] } | { ok: false; motivo: string };

/** ADR 017, decisão 6: o host precisa resolver só para endereços públicos. */
export async function checarDns(host: string, resolver: Resolvedor): Promise<ChecagemDns> {
  let enderecos: string[];
  try {
    enderecos = await resolver(host);
  } catch {
    return { ok: false, motivo: "o nome não resolve no DNS" };
  }
  if (enderecos.length === 0) return { ok: false, motivo: "o nome não resolve no DNS" };
  const internos = enderecos.filter(ipBloqueado);
  if (internos.length > 0) return { ok: false, motivo: `o nome resolve para endereço interno (${internos.join(", ")})` };
  return { ok: true, enderecos };
}

/** `llm-runs.csv` do TCC (só leitura) e de todas as análises avulsas. */
export function arquivosLlmRuns(raiz: string): string[] {
  const lista = [join(raiz, "data", "processed", "llm-runs.csv")];
  const base = join(raiz, "data", "avulsos");
  if (existsSync(base)) {
    for (const site of readdirSync(base)) {
      const dirSite = join(base, site);
      let pastas: string[];
      try {
        pastas = readdirSync(dirSite);
      } catch {
        continue;
      }
      for (const c of pastas) lista.push(join(dirSite, c, "data", "processed", "llm-runs.csv"));
    }
  }
  return lista.filter((f) => existsSync(f));
}

export function saldoLlmAtual(raiz: string): { saldoUsd: number; gastoUsd: number } {
  const gastos = arquivosLlmRuns(raiz).map((f) => gastoDoCsv(readCsvObjects(f)));
  const gastoUsd = gastos.reduce((a, b) => a + b, 0);
  return { saldoUsd: saldoLlm(gastos), gastoUsd };
}

// ------------------------------------------------------------- fila ------

export class Fila {
  private readonly analises = new Map<string, Analise>();
  private readonly pendentes: Array<{ analise: Analise; tarefa: () => Promise<void> }> = [];
  private ocupada = false;
  readonly eventos = new EventEmitter();

  constructor(private readonly deps: Dependencias) {
    this.eventos.setMaxListeners(100);
  }

  obter(id: string): Analise | undefined {
    return this.analises.get(id);
  }

  listar(): Analise[] {
    return [...this.analises.values()];
  }

  /** Promessa que resolve quando a fila esvazia (usada nos testes). */
  async ociosa(): Promise<void> {
    while (this.ocupada || this.pendentes.length > 0) await new Promise((r) => setTimeout(r, 5));
  }

  private emitir(a: Analise, e: Evento): void {
    if (e.tipo === "log") {
      const logs = a.eventos.filter((x) => x.tipo === "log").length;
      if (logs >= MAX_LOGS) return;
    }
    a.eventos.push(e);
    this.eventos.emit(a.id, e);
  }

  private mudar(a: Analise, estado: Estado, motivo?: string): void {
    a.estado = estado;
    if (motivo !== undefined) a.motivo = motivo;
    this.emitir(a, { tipo: "estado", estado, ...(motivo !== undefined ? { motivo } : {}), em: this.deps.agora().toISOString() });
    if (estado !== "na-fila" && estado !== "rodando") this.gravarRegistro(a);
  }

  /** `analise.json` na pasta: permite ler o resultado depois de reiniciar o servidor. */
  private gravarRegistro(a: Analise): void {
    if (!existsSync(a.pasta)) return;
    const { eventos, ...resto } = a;
    writeFileSync(
      join(a.pasta, "analise.json"),
      `${JSON.stringify({ ...resto, eventos: eventos.filter((e) => e.tipo !== "log") }, null, 2)}\n`,
    );
  }

  private novaAnalise(tipo: Analise["tipo"], site: string, host: string, opcoes: Analise["opcoes"]): Analise {
    let quando = this.deps.agora();
    let c = carimbo(quando);
    // duas análises do mesmo site no mesmo segundo: avança o carimbo
    while (this.analises.has(`${site}__${c}`) || existsSync(join(this.deps.raiz, "data", "avulsos", site, c))) {
      quando = new Date(quando.getTime() + 1000);
      c = carimbo(quando);
    }
    const id = `${site}__${c}`;
    const a: Analise = {
      id,
      tipo,
      site,
      host,
      pasta: join(this.deps.raiz, "data", "avulsos", site, c),
      opcoes,
      estado: "na-fila",
      criadaEm: this.deps.agora().toISOString(),
      eventos: [],
    };
    this.analises.set(id, a);
    return a;
  }

  private enfileirar(a: Analise, tarefa: () => Promise<void>): void {
    this.emitir(a, { tipo: "estado", estado: "na-fila", em: this.deps.agora().toISOString() });
    this.pendentes.push({ analise: a, tarefa });
    void this.proxima();
  }

  private async proxima(): Promise<void> {
    if (this.ocupada) return;
    const item = this.pendentes.shift();
    if (!item) return;
    this.ocupada = true;
    try {
      this.mudar(item.analise, "rodando");
      await item.tarefa();
    } catch (e) {
      this.mudar(item.analise, "falhou", e instanceof Error ? e.message : String(e));
    } finally {
      this.ocupada = false;
      void this.proxima();
    }
  }

  /** Roda uma etapa e devolve o código de saída. */
  private async rodarEtapa(a: Analise, etapa: Etapa): Promise<number> {
    const inicio = this.deps.agora();
    this.emitir(a, { tipo: "etapa-inicio", etapa: etapa.nome, rotulo: ROTULO_ETAPA[etapa.nome], em: inicio.toISOString() });
    const codigo = await this.deps.executar(etapa, a.pasta, (linha) =>
      this.emitir(a, { tipo: "log", etapa: etapa.nome, linha, em: this.deps.agora().toISOString() }),
    );
    const fim = this.deps.agora();
    this.emitir(a, { tipo: "etapa-fim", etapa: etapa.nome, codigo, duracaoMs: fim.getTime() - inicio.getTime(), em: fim.toISOString() });
    return codigo;
  }

  /** Análise avulsa de uma URL já validada (ADR 017, decisão 2). */
  analisarUrl(host: string, site: string, opcoes: { llm: boolean; vnu: boolean; tetoUsd: number | null }): Analise {
    const a = this.novaAnalise("avulso", site, host, opcoes);
    this.enfileirar(a, async () => {
      // DNS de novo na hora de rodar: a fila pode ter demorado (ADR 017, decisão 6)
      const dns = await checarDns(host, this.deps.resolver);
      if (!dns.ok) return this.mudar(a, "recusada", dns.motivo);

      mkdirSync(join(a.pasta, "data", "input"), { recursive: true });
      writeFileSync(join(a.pasta, "data", "input", "registros-ufrn.txt"), `${host}\n`);
      // Com LLM, o módulo 3 lê o prompt versionado relativo ao cwd
      // (`docs/prompts/`, ADR 016). A cópia também deixa na pasta o prompt usado.
      if (opcoes.llm) {
        const prompts = join(this.deps.raiz, "docs", "prompts");
        if (!existsSync(prompts)) return this.mudar(a, "falhou", "sem docs/prompts/ no repositório para a LLM");
        cpSync(prompts, join(a.pasta, "docs", "prompts"), { recursive: true });
      }

      const plano = planoAvulso({ id: site, llm: opcoes.llm, vnu: opcoes.vnu, tetoUsd: opcoes.tetoUsd ?? 0 });
      for (const etapa of plano) {
        const codigo = await this.rodarEtapa(a, etapa);
        if (codigo !== 0) return this.mudar(a, "falhou", `${ROTULO_ETAPA[etapa.nome]} terminou com código ${codigo}`);

        if (etapa.nome === "classificacao") {
          const corpus = join(a.pasta, "data", "corpus.csv");
          const d = desfechoTriagem(existsSync(corpus) ? readCsvObjects(corpus) : [], site);
          if (!d.incluido) return this.mudar(a, "excluida", d.motivo);
        }
        if (etapa.nome === "coleta") {
          const incompleta = coletaIncompleta(join(a.pasta, "data", "raw", site));
          if (incompleta) return this.mudar(a, "falhou", incompleta);
        }
        const faltou = saidaAusente(a.pasta, site, etapa.nome);
        if (faltou) return this.mudar(a, "falhou", faltou);
      }
      this.mudar(a, "concluida");
    });
    return a;
  }

  /** Regras sobre a cópia do bruto de um site do corpus, sem LLM (ADR 017, decisão 4). */
  recomendarCorpus(site: string): Analise {
    const a = this.novaAnalise("corpus", site, site, { llm: false, vnu: false, tetoUsd: null });
    this.enfileirar(a, async () => {
      const origem = join(this.deps.raiz, "data", "raw", site);
      if (!existsSync(join(origem, "collect.json"))) return this.mudar(a, "falhou", "sem coleta deste site em data/raw/");
      cpSync(origem, join(a.pasta, "data", "raw", site), { recursive: true });
      for (const etapa of planoCorpus(site)) {
        const codigo = await this.rodarEtapa(a, etapa);
        if (codigo !== 0) return this.mudar(a, "falhou", `${ROTULO_ETAPA[etapa.nome]} terminou com código ${codigo}`);
        const faltou = saidaAusente(a.pasta, site, etapa.nome);
        if (faltou) return this.mudar(a, "falhou", faltou);
      }
      this.mudar(a, "concluida");
    });
    return a;
  }
}

/**
 * Os módulos 2 e 3 registram o erro de um site e saem com código 0 (erro por
 * site não derruba o lote). Para uma análise de um site só, isso é falha:
 * `null` se a etapa gravou o que devia; senão, o motivo (S21).
 */
export function saidaAusente(pasta: string, site: string, etapa: NomeEtapa): string | null {
  const arquivo = etapa === "analise" ? "metrics.json" : etapa === "recomendacao" ? "recommendations.json" : null;
  if (arquivo === null || existsSync(join(pasta, "data", "processed", "sites", site, arquivo))) return null;
  return `${ROTULO_ETAPA[etapa]} não gerou ${arquivo} (ver logs/ na pasta da análise)`;
}

/** `null` se a coleta tem página e Lighthouse completos; senão, o motivo. */
export function coletaIncompleta(dirRaw: string): string | null {
  for (const arquivo of ["collect.json", "lighthouse.json"]) {
    const p = join(dirRaw, arquivo);
    if (!existsSync(p)) return `coleta sem ${arquivo}`;
    const j = JSON.parse(readFileSync(p, "utf8")) as { completo?: boolean; erro?: unknown; motivo?: unknown };
    if (j.completo !== true) {
      const detalhe = j.motivo ?? j.erro;
      return `coleta incompleta (${arquivo}${detalhe ? `: ${typeof detalhe === "string" ? detalhe : JSON.stringify(detalhe)}` : ""})`;
    }
  }
  return null;
}

// ------------------------------------------------- executor real ---------

/**
 * Executor de verdade: `node <tsx> --env-file-if-exists=<raiz>/.env <raiz>/<módulo> ...args`,
 * com o cwd na pasta da análise. O `.env` da raiz traz o `CONTACT_EMAIL`
 * (User-Agent, regra 2) e a chave da API (só com `--llm`).
 */
export function executorReal(raiz: string): Executor {
  const tsx = join(raiz, "node_modules", "tsx", "dist", "cli.mjs");
  return (etapa, cwd, onLinha) =>
    new Promise((resolve) => {
      mkdirSync(cwd, { recursive: true });
      const filho = spawn(
        process.execPath,
        [tsx, `--env-file-if-exists=${join(raiz, ".env")}`, join(raiz, etapa.modulo), ...etapa.args],
        { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
      );
      for (const s of [filho.stdout, filho.stderr]) createInterface({ input: s }).on("line", onLinha);
      filho.on("error", (e) => {
        onLinha(`erro ao iniciar: ${e.message}`);
        resolve(-1);
      });
      filho.on("close", (codigo) => resolve(codigo ?? -1));
    });
}
