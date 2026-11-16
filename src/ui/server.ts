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
 *   GET  /api/corpus/:id/captura/:nome  landmarks-original|landmarks-corrigido (validação da S18)
 *   GET  /api/corpus/:id/tela-final/:variante?versao=v1.0|mais-recente
 *                                       final-screenshot do Lighthouse (execução mediana da validação)
 *   GET  /api/llm                       saldo global da LLM
 *
 * Fora de `/api`, serve as telas compiladas (`ui/dist`, S21), se existirem.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { readCsvObjects } from "../shared/csv.js";
import { decodificar } from "../recommend/encoding.js";
import { buildMeta } from "../shared/meta.js";
import type { Recommendation } from "../shared/types.js";
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
import { trechosDasCorrecoes } from "./trechos.js";
import { ARQUIVO_VERSAO, PASTA_VERSAO, extrairTelaFinal, resumoValidacao, versoesValidacao } from "./validacao.js";

const LIMITE_CORPO = 16 * 1024;

/** Capturas antes × depois que existem no TCC (validação da `landmarks-llm`, S18). */
const CAPTURAS = ["landmarks-original", "landmarks-corrigido"] as const;

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
};

/** Só o próprio servidor: as telas não carregam nada de fora. */
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export interface OpcoesServidor {
  porta: number;
  /** Pasta das telas compiladas (`ui/dist`); sem ela, só a API. */
  estaticos?: string;
}

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
  const recommendations = lerJson(join(processed, "recommendations.json"));
  return {
    metrics: lerJson(join(processed, "metrics.json")),
    recommendations,
    fixDiff: lerTexto(join(processed, "fix.diff")),
    trechos: trechosDoBruto(join(base, "data", "raw", site, "index.html"), recommendations),
    temScreenshot: existsSync(join(base, "data", "raw", site, "screenshot.png")),
  };
}

/** Trechos antes × depois de cada correção, sobre o mesmo bruto que o módulo 3 leu (S21). */
function trechosDoBruto(caminho: string, recommendations: unknown) {
  const recs = (recommendations as { recommendations?: Recommendation[] } | null)?.recommendations;
  if (!Array.isArray(recs) || !existsSync(caminho)) return {};
  return trechosDasCorrecoes(decodificar(readFileSync(caminho)).texto, recs);
}

/** Recomendação mais recente feita pela interface para um site do corpus. */
function ultimaRecomendacaoCorpus(raiz: string, site: string): { id: string; pasta: string } | null {
  const dir = join(raiz, "data", "avulsos", site);
  if (!existsSync(dir)) return null;
  for (const c of readdirSync(dir).sort().reverse()) {
    const pasta = join(dir, c);
    const reg = lerJson(join(pasta, "analise.json")) as { tipo?: string; estado?: string } | null;
    const saida = join(pasta, "data", "processed", "sites", site, "recommendations.json");
    if (reg?.tipo === "corpus" && reg.estado === "concluida" && existsSync(saida)) return { id: `${site}__${c}`, pasta };
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

export function criarServidor(deps: Dependencias, opcoes: OpcoesServidor): Servidor {
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

    if (partes[0] !== "api") return estatico(req, res, url.pathname);
    const [, recurso, id, sub, ...resto] = partes;

    // ---- captura antes × depois da validação (só leitura, nomes fixos)
    if (recurso === "corpus" && sub === "captura" && resto.length === 1 && metodo === "GET") {
      const nome = resto[0]!;
      if (id === undefined || !ID_SITE.test(id) || !(CAPTURAS as readonly string[]).includes(nome)) {
        return json(res, 404, { erro: "captura não encontrada" });
      }
      return enviarPng(res, join(deps.raiz, "data", "processed", "sites", id, `${nome}.png`));
    }
    // ---- primeira tela antes × depois, do relatório do Lighthouse da validação (só leitura)
    if (recurso === "corpus" && sub === "tela-final" && resto.length === 1 && metodo === "GET") {
      const variante = resto[0]!;
      const versao = url.searchParams.get("versao") ?? "mais-recente";
      if (id === undefined || !ID_SITE.test(id) || (variante !== "original" && variante !== "corrigido") || !(versao === "v1.0" || versao === "mais-recente")) {
        return json(res, 404, { erro: "captura não encontrada" });
      }
      const pastaSite = join(deps.raiz, "data", "processed", "sites", id);
      const resumoV = resumoValidacao(lerJson(join(pastaSite, ARQUIVO_VERSAO[versao])), versao, ARQUIVO_VERSAO[versao]);
      const n = resumoV?.medianas[variante];
      if (n === null || n === undefined || !Number.isInteger(n)) return json(res, 404, { erro: "sem execução mediana" });
      const tela = extrairTelaFinal(lerJson(join(pastaSite, PASTA_VERSAO[versao], `lh-${variante}-${n}.json`)));
      if (!tela) return json(res, 404, { erro: "sem final-screenshot" });
      res.writeHead(200, { "content-type": tela.tipo, "cache-control": "no-store", "x-content-type-options": "nosniff" });
      res.end(tela.bytes);
      return;
    }
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
      let recomendacao: {
        origem: "tcc" | "interface";
        analise?: string;
        recommendations: unknown;
        fixDiff: string | null;
        trechos: ReturnType<typeof trechosDoBruto>;
      } | null = null;
      if (tcc.recommendations !== null) {
        recomendacao = { origem: "tcc", recommendations: tcc.recommendations, fixDiff: tcc.fixDiff, trechos: tcc.trechos };
      } else {
        const ultima = ultimaRecomendacaoCorpus(deps.raiz, id);
        if (ultima) {
          const r = resultadoDaPasta(ultima.pasta, id);
          recomendacao = { origem: "interface", analise: ultima.id, recommendations: r.recommendations, fixDiff: r.fixDiff, trechos: r.trechos };
        }
      }
      const pastaSite = join(deps.raiz, "data", "processed", "sites", id);
      const capturas = CAPTURAS.filter((c) => existsSync(join(pastaSite, `${c}.png`)));
      const temBruto = existsSync(join(deps.raiz, "data", "raw", id, "index.html"));
      // validação do módulo 4 (só leitura): v1.0 e a rodada mais recente
      const validacoes = versoesValidacao(lerJson(join(pastaSite, "validation-v1.0.json")), lerJson(join(pastaSite, "validation.json")));
      return json(res, 200, { id, dataset: linha, metrics: tcc.metrics, temScreenshot: tcc.temScreenshot, temBruto, capturas, recomendacao, validacoes });
    }

    return json(res, 404, { erro: "rota não encontrada" });
  }

  /** Telas compiladas: arquivo dentro de `estaticos`, ou o `index.html` (rotas do lado do cliente). */
  function estatico(req: IncomingMessage, res: ServerResponse, caminho: string): void {
    if (!opcoes.estaticos) return json(res, 404, { erro: "rota não encontrada" });
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { erro: "método não permitido" });
    const raizEst = resolve(opcoes.estaticos);
    let alvo = resolve(raizEst, "." + decodeURIComponent(caminho));
    if (alvo !== raizEst && !alvo.startsWith(raizEst + sep)) return json(res, 404, { erro: "rota não encontrada" });
    if (!existsSync(alvo) || !statSync(alvo).isFile()) alvo = join(raizEst, "index.html");
    if (!existsSync(alvo)) return json(res, 404, { erro: "telas não compiladas (npm run ui:build)" });
    const tipo = TIPOS[extname(alvo).toLowerCase()];
    if (!tipo) return json(res, 404, { erro: "rota não encontrada" });
    res.writeHead(200, {
      "content-type": tipo,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": CSP,
      "referrer-policy": "no-referrer",
    });
    res.end(req.method === "HEAD" ? undefined : readFileSync(alvo));
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
  const dist = join(raiz, "ui", "dist");
  const temTelas = existsSync(join(dist, "index.html"));
  const { server } = criarServidor(
    { raiz, executar: executorReal(raiz), resolver: resolverDns, agora: () => new Date() },
    { porta, ...(temTelas ? { estaticos: dist } : {}) },
  );
  server.listen(porta, "127.0.0.1", () => {
    const meta = buildMeta();
    const onde = temTelas ? `http://127.0.0.1:${porta}/` : `http://127.0.0.1:${porta}/api (sem telas: npm run ui:build)`;
    process.stderr.write(
      `[ui] ${onde} · commit ${meta.gitCommit?.slice(0, 7) ?? "?"}${meta.gitDirty ? " (dirty)" : ""} · só local (ADR 017)\n`,
    );
  });
}
