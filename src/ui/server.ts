/**
 * Interface visual (S20, ADR 017): servidor HTTP local.
 *
 *   npm run ui:server [-- --porta 5179]
 *
 * Escuta só em 127.0.0.1. Rotas (JSON):
 *   POST /api/analises                  { url, llm?, vnu? } → 202 { id } (análise avulsa)
 *   GET  /api/analises                  análises desde que o servidor subiu
 *   GET  /api/analises/:id              estado e eventos
 *   GET  /api/analises/:id/eventos      progresso (Server-Sent Events)
 *   GET  /api/analises/:id/resultado    metrics.json, recommendations.json, fix.diff
 *   GET  /api/analises/:id/screenshot   screenshot.png da coleta (avulsa)
 *   GET  /api/corpus                    linhas do dataset.csv (só leitura)
 *   GET  /api/corpus/:id                métricas e recomendações de um site do corpus
 *   POST /api/corpus/:id/recomendar     regras sobre cópia do bruto, sem LLM → 202 { id }
 *   GET  /api/corpus/:id/screenshot     screenshot.png da coleta do TCC
 *   GET  /api/llm                       saldo global da LLM
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readCsvObjects } from "../shared/csv.js";
import { buildMeta } from "../shared/meta.js";
import {
  type Analise,
  type Dependencias,
  Fila,
  ID_SITE,
  checarDns,
  executorReal,
  pastaDaAnalise,
  saldoLlmAtual,
} from "./analise.js";
import { validarUrl } from "./pipeline.js";

const LIMITE_CORPO = 16 * 1024;

export interface Servidor {
  server: Server;
  fila: Fila;
}

function json(res: ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(texto);
}

function lerJson(caminho: string): unknown {
  return existsSync(caminho) ? (JSON.parse(readFileSync(caminho, "utf8")) as unknown) : null;
}

function lerTexto(caminho: string): string | null {
  return existsSync(caminho) ? readFileSync(caminho, "utf8") : null;
}

function enviarPng(res: ServerResponse, caminho: string): void {
  if (!existsSync(caminho)) return json(res, 404, { erro: "sem screenshot" });
  res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(readFileSync(caminho));
}

async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  const partes: Buffer[] = [];
  let tamanho = 0;
  for await (const p of req) {
    const b = p as Buffer;
    tamanho += b.length;
    if (tamanho > LIMITE_CORPO) throw new Error("corpo grande demais");
    partes.push(b);
  }
  const texto = Buffer.concat(partes).toString("utf8");
  return texto === "" ? {} : (JSON.parse(texto) as unknown);
}

/** Saídas de uma pasta com a estrutura de `data/` (avulsa ou do TCC). */
function resultadoDaPasta(base: string, site: string) {
  const processed = join(base, "data", "processed", "sites", site);
  return {
    metrics: lerJson(join(processed, "metrics.json")),
    recommendations: lerJson(join(processed, "recommendations.json")),
    fixDiff: lerTexto(join(processed, "fix.diff")),
    temScreenshot: existsSync(join(base, "data", "raw", site, "screenshot.png")),
  };
}

/** Recomendação mais recente feita pela interface para um site do corpus. */
function ultimaRecomendacaoCorpus(raiz: string, site: string): { id: string; pasta: string } | null {
  const dir = join(raiz, "data", "avulsos", site);
  if (!existsSync(dir)) return null;
  for (const c of readdirSync(dir).sort().reverse()) {
    const pasta = join(dir, c);
    const reg = lerJson(join(pasta, "analise.json")) as { tipo?: string; estado?: string } | null;
    if (reg?.tipo === "corpus" && reg.estado === "concluida") return { id: `${site}__${c}`, pasta };
  }
  return null;
}

function resumo(a: Analise) {
  const { eventos, pasta, ...resto } = a;
  return { ...resto, pasta: pasta.replace(/\\/g, "/"), eventosTotal: eventos.length };
}

/** Lê o registro de uma análise: da memória ou do `analise.json` em disco. */
function registroDaAnalise(fila: Fila, raiz: string, id: string): { analise: Partial<Analise> & { site: string }; pasta: string } | null {
  const viva = fila.obter(id);
  if (viva) return { analise: viva, pasta: viva.pasta };
  const pasta = pastaDaAnalise(raiz, id);
  if (!pasta || !existsSync(pasta)) return null;
  const reg = lerJson(join(pasta, "analise.json")) as (Partial<Analise> & { site: string }) | null;
  const site = id.split("__")[0]!;
  return { analise: reg ?? { site }, pasta };
}

export function criarServidor(deps: Dependencias, opcoes: { porta: number }): Servidor {
  const fila = new Fila(deps);
  const datasetPath = join(deps.raiz, "data", "processed", "dataset.csv");
  const lerDataset = () => (existsSync(datasetPath) ? readCsvObjects(datasetPath) : []);

  const server = createServer((req, res) => {
    void rotear(req, res).catch((e: unknown) => {
      if (!res.headersSent) json(res, 500, { erro: e instanceof Error ? e.message : String(e) });
      else res.end();
    });
  });

  async function rotear(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Só aceita o próprio endereço no Host: barra páginas de terceiros que
    // tentem falar com o servidor local por DNS rebinding (ADR 017, decisão 6).
    const porta = (server.address() as { port: number } | null)?.port ?? opcoes.porta;
    const hostsAceitos = new Set([`127.0.0.1:${porta}`, `localhost:${porta}`]);
    if (!hostsAceitos.has(req.headers.host ?? "")) return json(res, 403, { erro: "host não permitido" });
    const origem = req.headers.origin;
    if (origem !== undefined && !hostsAceitos.has(origem.replace(/^https?:\/\//, ""))) {
      return json(res, 403, { erro: "origem não permitida" });
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const partes = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const metodo = req.method ?? "GET";

    if (partes[0] !== "api") return json(res, 404, { erro: "rota não encontrada" });
    const [, recurso, id, sub, ...resto] = partes;
    if (resto.length > 0) return json(res, 404, { erro: "rota não encontrada" });

    // ---- LLM
    if (recurso === "llm" && id === undefined && metodo === "GET") {
      return json(res, 200, { tetoUsd: 4.5, ...saldoLlmAtual(deps.raiz) });
    }

    // ---- análises avulsas
    if (recurso === "analises") {
      if (id === undefined) {
        if (metodo === "GET") return json(res, 200, fila.listar().map(resumo));
        if (metodo !== "POST") return json(res, 405, { erro: "método não permitido" });
        let corpo: { url?: unknown; llm?: unknown; vnu?: unknown };
        try {
          corpo = (await lerCorpo(req)) as typeof corpo;
        } catch {
          return json(res, 400, { erro: "corpo JSON inválido" });
        }
        if (typeof corpo.url !== "string") return json(res, 400, { erro: "informe a url" });
        const v = validarUrl(corpo.url);
        if (!v.ok) return json(res, 400, { erro: v.motivo });
        const dns = await checarDns(v.host, deps.resolver);
        if (!dns.ok) return json(res, 400, { erro: dns.motivo });
        const llm = corpo.llm === true;
        let tetoUsd: number | null = null;
        if (llm) {
          const { saldoUsd } = saldoLlmAtual(deps.raiz);
          if (saldoUsd <= 0) return json(res, 400, { erro: "sem saldo para a LLM" });
          tetoUsd = saldoUsd;
        }
        const a = fila.analisarUrl(v.host, v.id, { llm, vnu: corpo.vnu === true, tetoUsd });
        return json(res, 202, { id: a.id, site: a.site, estado: a.estado });
      }

      if (metodo !== "GET") return json(res, 405, { erro: "método não permitido" });
      const reg = registroDaAnalise(fila, deps.raiz, id);
      if (!reg) return json(res, 404, { erro: "análise não encontrada" });

      if (sub === undefined) {
        const viva = fila.obter(id);
        return json(res, 200, viva ? { ...resumo(viva), eventos: viva.eventos } : reg.analise);
      }
      if (sub === "resultado") return json(res, 200, { id, ...resultadoDaPasta(reg.pasta, reg.analise.site) });
      if (sub === "screenshot") return enviarPng(res, join(reg.pasta, "data", "raw", reg.analise.site, "screenshot.png"));
      if (sub === "eventos") return sse(req, res, id);
      return json(res, 404, { erro: "rota não encontrada" });
    }

    // ---- corpus do TCC (só leitura de data/processed/ e data/raw/)
    if (recurso === "corpus") {
      if (id === undefined) {
        if (metodo !== "GET") return json(res, 405, { erro: "método não permitido" });
        return json(res, 200, lerDataset());
      }
      if (!ID_SITE.test(id)) return json(res, 400, { erro: "id inválido" });
      const linha = lerDataset().find((l) => l.id === id);
      if (!linha) return json(res, 404, { erro: "site fora do dataset" });

      if (sub === "recomendar") {
        if (metodo !== "POST") return json(res, 405, { erro: "método não permitido" });
        const a = fila.recomendarCorpus(id);
        return json(res, 202, { id: a.id, site: a.site, estado: a.estado });
      }
      if (metodo !== "GET") return json(res, 405, { erro: "método não permitido" });
      if (sub === "screenshot") return enviarPng(res, join(deps.raiz, "data", "raw", id, "screenshot.png"));
      if (sub !== undefined) return json(res, 404, { erro: "rota não encontrada" });

      const tcc = resultadoDaPasta(deps.raiz, id);
      let recomendacao: { origem: "tcc" | "interface"; analise?: string; recommendations: unknown; fixDiff: string | null } | null = null;
      if (tcc.recommendations !== null) {
        recomendacao = { origem: "tcc", recommendations: tcc.recommendations, fixDiff: tcc.fixDiff };
      } else {
        const ultima = ultimaRecomendacaoCorpus(deps.raiz, id);
        if (ultima) {
          const r = resultadoDaPasta(ultima.pasta, id);
          recomendacao = { origem: "interface", analise: ultima.id, recommendations: r.recommendations, fixDiff: r.fixDiff };
        }
      }
      return json(res, 200, { id, dataset: linha, metrics: tcc.metrics, temScreenshot: tcc.temScreenshot, recomendacao });
    }

    return json(res, 404, { erro: "rota não encontrada" });
  }

  function sse(req: IncomingMessage, res: ServerResponse, id: string): void {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    const enviar = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    const viva = fila.obter(id);
    if (!viva) {
      // análise de outra execução do servidor: só o estado final
      const reg = registroDaAnalise(fila, deps.raiz, id);
      enviar({ tipo: "estado", estado: reg?.analise.estado ?? "desconhecido", motivo: reg?.analise.motivo });
      res.end();
      return;
    }
    for (const e of viva.eventos) enviar(e);
    const terminal = (estado: string) => !["na-fila", "rodando"].includes(estado);
    if (terminal(viva.estado)) {
      res.end();
      return;
    }
    const ouvir = (e: { tipo: string; estado?: string }) => {
      enviar(e);
      if (e.tipo === "estado" && e.estado !== undefined && terminal(e.estado)) {
        fila.eventos.off(id, ouvir);
        res.end();
      }
    };
    fila.eventos.on(id, ouvir);
    req.on("close", () => fila.eventos.off(id, ouvir));
  }

  return { server, fila };
}

// ------------------------------------------------------------ main -------

async function resolverDns(host: string): Promise<string[]> {
  return (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const i = process.argv.indexOf("--porta");
  const porta = i >= 0 ? Number(process.argv[i + 1]) : 5179;
  const { server } = criarServidor(
    { raiz, executar: executorReal(raiz), resolver: resolverDns, agora: () => new Date() },
    { porta },
  );
  server.listen(porta, "127.0.0.1", () => {
    const meta = buildMeta();
    process.stderr.write(
      `[ui] http://127.0.0.1:${porta}/api · commit ${meta.gitCommit?.slice(0, 7) ?? "?"}${meta.gitDirty ? " (dirty)" : ""} · só local (ADR 017)\n`,
    );
  });
}
