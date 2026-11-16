import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Dependencias, Executor } from "../../src/ui/analise.js";
import type { Etapa } from "../../src/ui/pipeline.js";
import { criarServidor } from "../../src/ui/server.js";

/**
 * Servidor com os módulos simulados: o executor grava, na pasta da análise,
 * os arquivos que cada módulo gravaria, conforme o cenário do teste.
 */

type Cenario = { excluir?: string; coletaIncompleta?: boolean; falharEm?: Etapa["nome"] };

function escrever(caminho: string, conteudo: string): void {
  mkdirSync(join(caminho, ".."), { recursive: true });
  writeFileSync(caminho, conteudo);
}

function executorSimulado(chamadas: Array<{ etapa: Etapa; cwd: string }>, cenario: () => Cenario, portao: () => Promise<void>): Executor {
  return async (etapa, cwd, onLinha) => {
    await portao();
    chamadas.push({ etapa, cwd });
    const c = cenario();
    onLinha(`simulado: ${etapa.nome}`);
    if (c.falharEm === etapa.nome) return 2;
    const iSite = etapa.args.indexOf("--site");
    const id =
      iSite >= 0
        ? etapa.args[iSite + 1]!
        : readFileSync(join(cwd, "data", "input", "registros-ufrn.txt"), "utf8").trim().replace(/^www\./, "");
    if (etapa.nome === "classificacao") {
      escrever(
        join(cwd, "data", "corpus.csv"),
        `id,url_final,incluido,motivo_exclusao\n${id},https://${id}/,${c.excluir ? "false" : "true"},${c.excluir ?? ""}\n`,
      );
    }
    if (etapa.nome === "coleta") {
      const raw = join(cwd, "data", "raw", id);
      escrever(join(raw, "collect.json"), JSON.stringify({ completo: true }));
      escrever(join(raw, "lighthouse.json"), JSON.stringify(c.coletaIncompleta ? { completo: false, motivo: "NO_FCP" } : { completo: true }));
      escrever(join(raw, "screenshot.png"), "PNG-SIMULADO");
    }
    if (etapa.nome === "analise") escrever(join(cwd, "data", "processed", "sites", id, "metrics.json"), JSON.stringify({ id, indice: { valor: 61 } }));
    if (etapa.nome === "recomendacao") {
      const dir = join(cwd, "data", "processed", "sites", id);
      escrever(join(dir, "recommendations.json"), JSON.stringify({ id, resumo: { total: 3 } }));
      escrever(join(dir, "fix.diff"), "--- a\n+++ b\n");
      if (etapa.args.includes("--llm")) escrever(join(cwd, "data", "processed", "llm-runs.csv"), "site,custo_usd\nx,0.25\n");
    }
    return 0;
  };
}

let raiz: string;
let base: string;
let fechar: () => Promise<void>;
let chamadas: Array<{ etapa: Etapa; cwd: string }>;
let cenario: Cenario;
let dns: Record<string, string[]>;
let portao: Promise<void>;
let fila: ReturnType<typeof criarServidor>["fila"];

beforeEach(async () => {
  raiz = mkdtempSync(join(tmpdir(), "ui-servidor-"));
  // dados do "TCC": dataset, um site com recomendação e outro sem
  escrever(join(raiz, "data", "processed", "dataset.csv"), "id,tecnologia,indice_semantica\nmat.ufrn.br,wordpress,40\nagir.ufrn.br,estatico,55\n");
  escrever(join(raiz, "data", "processed", "llm-runs.csv"), "site,custo_usd\nmat.ufrn.br,0.0133\n");
  escrever(join(raiz, "data", "processed", "sites", "mat.ufrn.br", "metrics.json"), JSON.stringify({ id: "mat.ufrn.br" }));
  escrever(join(raiz, "data", "processed", "sites", "mat.ufrn.br", "recommendations.json"), JSON.stringify({ resumo: { total: 9 } }));
  escrever(join(raiz, "data", "processed", "sites", "agir.ufrn.br", "metrics.json"), JSON.stringify({ id: "agir.ufrn.br" }));
  escrever(join(raiz, "data", "raw", "agir.ufrn.br", "collect.json"), JSON.stringify({ completo: true }));
  escrever(join(raiz, "data", "raw", "agir.ufrn.br", "screenshot.png"), "PNG-TCC");

  chamadas = [];
  cenario = {};
  portao = Promise.resolve();
  dns = { "ppgsw.ufrn.br": ["177.20.147.10"], "www.exemplo.com.br": ["8.8.8.8"], "interno.exemplo.com": ["10.0.0.5"] };
  let t = Date.parse("2026-11-16T20:00:00Z");
  const deps: Dependencias = {
    raiz,
    executar: executorSimulado(chamadas, () => cenario, () => portao),
    resolver: async (h) => {
      if (!(h in dns)) throw new Error("ENOTFOUND");
      return dns[h]!;
    },
    agora: () => new Date((t += 1000)),
  };
  const s = criarServidor(deps, { porta: 0 });
  fila = s.fila;
  await new Promise<void>((r) => s.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(s.server.address() as AddressInfo).port}`;
  fechar = () => new Promise((r) => s.server.close(() => r()));
});

afterEach(async () => {
  await fechar();
  rmSync(raiz, { recursive: true, force: true });
});

const post = (p: string, corpo: unknown) =>
  fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
const getJson = async (p: string) => (await fetch(`${base}${p}`)).json() as Promise<Record<string, any>>;

describe("análise avulsa", () => {
  it("roda as 6 etapas na pasta da análise e serve o resultado", async () => {
    const r = await post("/api/analises", { url: "https://ppgsw.ufrn.br/pagina?x=1" });
    expect(r.status).toBe(202);
    const { id } = (await r.json()) as { id: string };
    expect(id).toMatch(/^ppgsw\.ufrn\.br__2026-11-16T20-00-\d{2}$/);
    await fila.ociosa();

    expect(chamadas.map((c) => c.etapa.nome)).toEqual(["triagem", "sondagem", "classificacao", "coleta", "analise", "recomendacao"]);
    const pasta = join(raiz, "data", "avulsos", "ppgsw.ufrn.br", id.split("__")[1]!);
    expect(new Set(chamadas.map((c) => c.cwd))).toEqual(new Set([pasta]));
    expect(readFileSync(join(pasta, "data", "input", "registros-ufrn.txt"), "utf8")).toBe("ppgsw.ufrn.br\n");

    const estado = await getJson(`/api/analises/${id}`);
    expect(estado.estado).toBe("concluida");
    expect(estado.eventos.filter((e: any) => e.tipo === "etapa-fim")).toHaveLength(6);

    const res = await getJson(`/api/analises/${id}/resultado`);
    expect(res.metrics).toEqual({ id: "ppgsw.ufrn.br", indice: { valor: 61 } });
    expect(res.recommendations.resumo.total).toBe(3);
    expect(res.fixDiff).toContain("+++ b");
    expect(res.temScreenshot).toBe(true);
    expect(await (await fetch(`${base}/api/analises/${id}/screenshot`)).text()).toBe("PNG-SIMULADO");

    // o registro em disco serve a análise mesmo sem a memória do servidor
    const reg = JSON.parse(readFileSync(join(pasta, "analise.json"), "utf8"));
    expect(reg).toMatchObject({ id, estado: "concluida", tipo: "avulso" });
    expect(reg.eventos.some((e: any) => e.tipo === "log")).toBe(false);

    // nada gravado nos dados do TCC
    expect(readdirSync(join(raiz, "data", "processed", "sites")).sort()).toEqual(["agir.ufrn.br", "mat.ufrn.br"]);
    expect(readFileSync(join(raiz, "data", "processed", "llm-runs.csv"), "utf8")).toBe("site,custo_usd\nmat.ufrn.br,0.0133\n");
  });

  it("para na triagem quando o site é excluído e mostra o motivo", async () => {
    cenario = { excluir: "robots" };
    const { id } = (await (await post("/api/analises", { url: "www.exemplo.com.br" })).json()) as { id: string };
    await fila.ociosa();
    expect(chamadas.map((c) => c.etapa.nome)).toEqual(["triagem", "sondagem", "classificacao"]);
    expect(await getJson(`/api/analises/${id}`)).toMatchObject({ estado: "excluida", motivo: "robots", site: "exemplo.com.br" });
  });

  it("falha com o motivo quando a coleta fica incompleta ou um módulo sai com erro", async () => {
    cenario = { coletaIncompleta: true };
    const a = (await (await post("/api/analises", { url: "ppgsw.ufrn.br" })).json()) as { id: string };
    await fila.ociosa();
    expect(await getJson(`/api/analises/${a.id}`)).toMatchObject({ estado: "falhou", motivo: "coleta incompleta (lighthouse.json: NO_FCP)" });

    cenario = { falharEm: "sondagem" };
    const b = (await (await post("/api/analises", { url: "ppgsw.ufrn.br" })).json()) as { id: string };
    await fila.ociosa();
    expect(b.id).not.toBe(a.id);
    expect(await getJson(`/api/analises/${b.id}`)).toMatchObject({
      estado: "falhou",
      motivo: "Triagem (DNS, HTTP e robots.txt) terminou com código 2",
    });
  });

  it("recusa URL inválida, nome que não resolve e nome que resolve para rede interna", async () => {
    for (const [url, erro] of [
      ["http://127.0.0.1/", "IP literal não é aceito; use o nome do site"],
      ["nao-existe.exemplo.org", "o nome não resolve no DNS"],
      ["interno.exemplo.com", "o nome resolve para endereço interno (10.0.0.5)"],
    ]) {
      const r = await post("/api/analises", { url });
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ erro });
    }
    expect((await post("/api/analises", { nada: 1 })).status).toBe(400);
    expect(chamadas).toHaveLength(0);
  });

  it("checa o DNS de novo na hora de rodar", async () => {
    let soltar!: () => void;
    portao = new Promise((r) => (soltar = r)); // segura a 1ª análise na 1ª etapa
    const a = (await (await post("/api/analises", { url: "www.exemplo.com.br" })).json()) as { id: string };
    const b = (await (await post("/api/analises", { url: "ppgsw.ufrn.br" })).json()) as { id: string };
    dns["ppgsw.ufrn.br"] = ["192.168.0.7"]; // mudou enquanto b esperava na fila
    soltar();
    await fila.ociosa();
    expect((await getJson(`/api/analises/${a.id}`)).estado).toBe("concluida");
    expect(await getJson(`/api/analises/${b.id}`)).toMatchObject({
      estado: "recusada",
      motivo: "o nome resolve para endereço interno (192.168.0.7)",
    });
    expect(chamadas.some((c) => c.cwd.includes("ppgsw"))).toBe(false);
  });

  it("LLM: passa o saldo global como teto e o gasto avulso entra no saldo seguinte", async () => {
    expect(await getJson("/api/llm")).toMatchObject({ tetoUsd: 4.5, gastoUsd: 0.0133 });
    await post("/api/analises", { url: "ppgsw.ufrn.br", llm: true });
    await fila.ociosa();
    const rec = chamadas.find((c) => c.etapa.nome === "recomendacao")!;
    expect(rec.etapa.args).toEqual(["--site", "ppgsw.ufrn.br", "--llm", "--teto-usd", "4.4867"]);
    const saldo = await getJson("/api/llm");
    expect(saldo.gastoUsd).toBeCloseTo(0.2633, 6);
    expect(saldo.saldoUsd).toBeCloseTo(4.2367, 6);
  });

  it("uma análise por vez, na ordem de chegada", async () => {
    const ids: string[] = [];
    for (const url of ["ppgsw.ufrn.br", "www.exemplo.com.br"]) ids.push(((await (await post("/api/analises", { url })).json()) as { id: string }).id);
    await fila.ociosa();
    const ordem = chamadas.map((c) => c.cwd.includes("ppgsw") ? "a" : "b").join("");
    expect(ordem).toBe("aaaaaabbbbbb");
  });
});

describe("SSE", () => {
  it("repete os eventos já emitidos e fecha no estado final", async () => {
    const { id } = (await (await post("/api/analises", { url: "ppgsw.ufrn.br" })).json()) as { id: string };
    const texto = await (await fetch(`${base}/api/analises/${id}/eventos`)).text();
    const eventos = texto.split("\n\n").filter(Boolean).map((b) => JSON.parse(b.replace(/^data: /, "")));
    expect(eventos[0]).toMatchObject({ tipo: "estado", estado: "na-fila" });
    expect(eventos.at(-1)).toMatchObject({ tipo: "estado", estado: "concluida" });
    expect(eventos.filter((e) => e.tipo === "etapa-inicio").map((e) => e.etapa)).toEqual([
      "triagem",
      "sondagem",
      "classificacao",
      "coleta",
      "analise",
      "recomendacao",
    ]);
  });
});

describe("corpus", () => {
  it("lista o dataset e lê métricas e recomendações do TCC", async () => {
    expect((await getJson("/api/corpus")).length).toBe(2);
    const mat = await getJson("/api/corpus/mat.ufrn.br");
    expect(mat.dataset).toMatchObject({ id: "mat.ufrn.br", tecnologia: "wordpress" });
    expect(mat.recomendacao).toMatchObject({ origem: "tcc", recommendations: { resumo: { total: 9 } } });
    expect((await fetch(`${base}/api/corpus/fora.ufrn.br`)).status).toBe(404);
    expect((await fetch(`${base}/api/corpus/..%2F..%2Fetc`)).status).toBe(400);
  });

  it("recomendar: regras sem LLM sobre cópia do bruto, sem tocar em data/raw nem data/processed", async () => {
    expect((await getJson("/api/corpus/agir.ufrn.br")).recomendacao).toBeNull();
    const r = await post("/api/corpus/agir.ufrn.br/recomendar", {});
    expect(r.status).toBe(202);
    await fila.ociosa();
    expect(chamadas.map((c) => c.etapa)).toEqual([{ nome: "recomendacao", modulo: "src/recommend/index.ts", args: ["--site", "agir.ufrn.br"] }]);
    const copia = join(chamadas[0]!.cwd, "data", "raw", "agir.ufrn.br", "screenshot.png");
    expect(readFileSync(copia, "utf8")).toBe("PNG-TCC");

    const agir = await getJson("/api/corpus/agir.ufrn.br");
    expect(agir.recomendacao).toMatchObject({ origem: "interface", recommendations: { resumo: { total: 3 } } });
    expect(existsSync(join(raiz, "data", "processed", "sites", "agir.ufrn.br", "recommendations.json"))).toBe(false);
    expect(readdirSync(join(raiz, "data", "raw", "agir.ufrn.br")).sort()).toEqual(["collect.json", "screenshot.png"]);
    expect(await (await fetch(`${base}/api/corpus/agir.ufrn.br/screenshot`)).text()).toBe("PNG-TCC");
  });
});

describe("proteções do servidor local", () => {
  function comHost(host: string, origin?: string): Promise<number> {
    const u = new URL(`${base}/api/llm`);
    return new Promise((resolve, reject) => {
      const req = request(
        { hostname: u.hostname, port: u.port, path: u.pathname, headers: { host, ...(origin ? { origin } : {}) } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  it("recusa Host e Origin de fora (DNS rebinding)", async () => {
    const porta = new URL(base).port;
    expect(await comHost(`127.0.0.1:${porta}`)).toBe(200);
    expect(await comHost(`localhost:${porta}`)).toBe(200);
    expect(await comHost(`atacante.exemplo.com:${porta}`)).toBe(403);
    expect(await comHost(`127.0.0.1:${porta}`, "https://atacante.exemplo.com")).toBe(403);
  });

  it("rotas e métodos desconhecidos", async () => {
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/api/xyz`)).status).toBe(404);
    expect((await fetch(`${base}/api/analises/nao-existe__2026-01-01T00-00-00`)).status).toBe(404);
    expect((await fetch(`${base}/api/analises/../../x`)).status).toBe(404);
    expect((await fetch(`${base}/api/corpus`, { method: "DELETE" })).status).toBe(405);
  });
});
