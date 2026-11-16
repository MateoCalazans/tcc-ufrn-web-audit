import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { criarServidor } from "../../src/ui/server.js";

/** Rotas acrescentadas na S21 para as telas: trechos, capturas e arquivos estáticos. */

function escrever(caminho: string, conteudo: string): void {
  mkdirSync(join(caminho, ".."), { recursive: true });
  writeFileSync(caminho, conteudo);
}

let raiz: string;
let base: string;
let fechar: () => Promise<void>;

beforeEach(async () => {
  raiz = mkdtempSync(join(tmpdir(), "ui-telas-"));
  const site = join(raiz, "data", "processed", "sites", "mat.ufrn.br");
  escrever(join(raiz, "data", "processed", "dataset.csv"), "id,tecnologia\nmat.ufrn.br,wordpress\n");
  escrever(join(raiz, "data", "raw", "mat.ufrn.br", "index.html"), "<html>\n<img src=a.png>\n</html>\n");
  escrever(
    join(site, "recommendations.json"),
    JSON.stringify({
      recommendations: [
        { id: "img-dimensions-1", correcaoAutomatica: true, edicoes: [{ inicio: 21, fim: 21, texto: ' width="1" height="1"' }] },
        { id: "render-blocking-hint-1", correcaoAutomatica: false, edicoes: [] },
      ],
    }),
  );
  escrever(join(site, "landmarks-original.png"), "PNG-ANTES");
  escrever(
    join(site, "validation.json"),
    JSON.stringify({
      meta: { generatedAt: "2026-11-16T19:54:45Z" },
      variantes: { original: { mediana: { n: 2 } }, corrigido: { mediana: { n: 1 } } },
      deltas: { cls: { original: 0, corrigido: 0.12, delta: 0.12 } },
    }),
  );
  const tela = (t: string) => JSON.stringify({ audits: { "final-screenshot": { details: { data: `data:image/jpeg;base64,${Buffer.from(t).toString("base64")}` } } } });
  escrever(join(site, "validacao", "lh-original-2.json"), tela("JPEG-ANTES"));
  escrever(join(site, "validacao", "lh-corrigido-1.json"), tela("JPEG-DEPOIS"));
  escrever(join(site, "validacao", "lh-corrigido-2.json"), tela("NAO-E-A-MEDIANA"));
  escrever(join(site, "landmarks-corrigido.png"), "PNG-DEPOIS");
  escrever(join(raiz, "ui", "dist", "index.html"), "<!doctype html><title>Telas</title>");
  escrever(join(raiz, "ui", "dist", "assets", "app.js"), "console.info(1)");
  escrever(join(raiz, "ui", "dist", "assets", "fonte.woff2"), "WOFF2");
  escrever(join(raiz, "segredo.txt"), "não pode sair");

  const s = criarServidor(
    {
      raiz,
      executar: async () => 0,
      resolver: async () => ["8.8.8.8"],
      agora: () => new Date("2026-11-16T20:00:00Z"),
    },
    { porta: 0, estaticos: join(raiz, "ui", "dist") },
  );
  await new Promise<void>((r) => s.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(s.server.address() as AddressInfo).port}`;
  fechar = () => new Promise((r) => s.server.close(() => r()));
});

afterEach(async () => {
  await fechar();
  rmSync(raiz, { recursive: true, force: true });
});

describe("dados para as telas", () => {
  it("trechos antes × depois de cada correção automática, lidos do bruto", async () => {
    const r = (await (await fetch(`${base}/api/corpus/mat.ufrn.br`)).json()) as Record<string, any>;
    expect(Object.keys(r.recomendacao.trechos)).toEqual(["img-dimensions-1"]);
    expect(r.recomendacao.trechos["img-dimensions-1"]).toMatchObject({
      linha: 2,
      antes: "<img src=a.png>",
      depois: '<img src=a.png width="1" height="1">',
    });
    expect(r.capturas).toEqual(["landmarks-original", "landmarks-corrigido"]);
    expect(r.validacoes).toHaveLength(1);
    expect(r.validacoes[0]).toMatchObject({ versao: "mais-recente", deltas: { cls: { delta: 0.12 } } });
  });

  it("primeira tela do Lighthouse: execução mediana de cada variante", async () => {
    const antes = await fetch(`${base}/api/corpus/mat.ufrn.br/tela-final/original`);
    expect(antes.headers.get("content-type")).toBe("image/jpeg");
    expect(await antes.text()).toBe("JPEG-ANTES");
    expect(await (await fetch(`${base}/api/corpus/mat.ufrn.br/tela-final/corrigido?versao=mais-recente`)).text()).toBe("JPEG-DEPOIS");
    expect((await fetch(`${base}/api/corpus/mat.ufrn.br/tela-final/corrigido?versao=v1.0`)).status).toBe(404);
    expect((await fetch(`${base}/api/corpus/mat.ufrn.br/tela-final/..%2Fsegredo`)).status).toBe(404);
    expect((await fetch(`${base}/api/corpus/mat.ufrn.br/tela-final/original?versao=../x`)).status).toBe(404);
  });

  it("capturas: só os nomes fixos", async () => {
    expect(await (await fetch(`${base}/api/corpus/mat.ufrn.br/captura/landmarks-corrigido`)).text()).toBe("PNG-DEPOIS");
    expect((await fetch(`${base}/api/corpus/mat.ufrn.br/captura/metrics`)).status).toBe(404);
    expect((await fetch(`${base}/api/corpus/mat.ufrn.br/captura/..%2F..%2F..%2Fsegredo`)).status).toBe(404);
    expect((await fetch(`${base}/api/corpus/mat.ufrn.br/captura/landmarks-original/x`)).status).toBe(404);
  });
});

describe("arquivos estáticos (ui/dist)", () => {
  it("serve o index.html com CSP e os assets com o tipo certo", async () => {
    const r = await fetch(`${base}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
    const js = await fetch(`${base}/assets/app.js`);
    expect(js.headers.get("content-type")).toContain("text/javascript");
    expect((await fetch(`${base}/assets/fonte.woff2`)).headers.get("content-type")).toBe("font/woff2");
  });

  it("rota do cliente cai no index.html; nada fora da pasta sai", async () => {
    expect(await (await fetch(`${base}/site/mat.ufrn.br`)).text()).toContain("<title>Telas</title>");
    const fuga = await (await fetch(`${base}/..%2F..%2Fsegredo.txt`)).text();
    expect(fuga).not.toContain("não pode sair");
    expect((await fetch(`${base}/`, { method: "POST" })).status).toBe(405);
  });
});
