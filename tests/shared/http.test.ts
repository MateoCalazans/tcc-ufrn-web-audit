import { afterEach, describe, expect, it } from "vitest";

import { buildUserAgent, HostLimiter } from "../../src/shared/http.js";

/** Promessa "manual" para segurar uma tarefa aberta e observar a concorrência. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Deixa a fila de microtasks e timers de 0 ms drenarem. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("HostLimiter", () => {
  it("permite no máximo 2 requisições simultâneas no total", async () => {
    const limiter = new HostLimiter({ minIntervalMs: 0 });
    let ativas = 0;
    let pico = 0;
    const portoes = [deferred(), deferred(), deferred(), deferred()];

    const resultados = portoes.map((g, i) =>
      limiter.schedule(`host${i}.example`, async () => {
        ativas++;
        pico = Math.max(pico, ativas);
        await g.promise;
        ativas--;
      }),
    );

    await flush();
    // Só 2 das 4 (hosts distintos) podem estar rodando ao mesmo tempo.
    expect(ativas).toBe(2);

    portoes[0]!.resolve();
    portoes[1]!.resolve();
    await flush();
    // As outras 2 assumem as vagas liberadas.
    expect(ativas).toBe(2);

    portoes[2]!.resolve();
    portoes[3]!.resolve();
    await Promise.all(resultados);
    expect(pico).toBe(2);
  });

  it("permite no máximo 1 requisição por host (serializa e preserva a ordem)", async () => {
    const limiter = new HostLimiter({ minIntervalMs: 0 });
    let ativas = 0;
    let pico = 0;
    const ordem: number[] = [];
    const portoes = [deferred(), deferred(), deferred()];

    const resultados = portoes.map((g, i) =>
      limiter.schedule("mesmo.example", async () => {
        ativas++;
        pico = Math.max(pico, ativas);
        ordem.push(i);
        await g.promise;
        ativas--;
      }),
    );

    await flush();
    expect(ativas).toBe(1);
    expect(ordem).toEqual([0]);

    portoes[0]!.resolve();
    await flush();
    expect(ordem).toEqual([0, 1]);

    portoes[1]!.resolve();
    await flush();
    portoes[2]!.resolve();
    await Promise.all(resultados);

    expect(pico).toBe(1);
    expect(ordem).toEqual([0, 1, 2]);
  });

  it("respeita ≥2 s entre requisições ao mesmo host (inclusive sequenciais)", async () => {
    // Relógio virtual: o tempo só avança quando o limitador "dorme".
    let t = 0;
    const now = (): number => t;
    const sleeps: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      sleeps.push(ms);
      t += ms;
    };
    const limiter = new HostLimiter({ minIntervalMs: 2000, now, sleep });

    // Três requisições instantâneas ao mesmo host, uma após a outra.
    await limiter.schedule("h.example", async () => {});
    await limiter.schedule("h.example", async () => {});
    await limiter.schedule("h.example", async () => {});

    // A 1ª não espera; a 2ª e a 3ª esperam o intervalo cheio (2000 ms cada).
    expect(sleeps).toEqual([2000, 2000]);
  });

  it("não aplica espaçamento entre hosts diferentes", async () => {
    let t = 0;
    const sleeps: number[] = [];
    const limiter = new HostLimiter({
      minIntervalMs: 2000,
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    });

    await limiter.schedule("a.example", async () => {});
    await limiter.schedule("b.example", async () => {});

    expect(sleeps).toEqual([]);
  });
});

describe("buildUserAgent", () => {
  const original = process.env.CONTACT_EMAIL;
  afterEach(() => {
    if (original === undefined) delete process.env.CONTACT_EMAIL;
    else process.env.CONTACT_EMAIL = original;
  });

  it("monta o User-Agent com versão do package.json e contato", () => {
    process.env.CONTACT_EMAIL = "contato@example.com";
    const ua = buildUserAgent();
    expect(ua).toMatch(
      /^TCC-EAJ-UFRN-Audit\/\d+\.\d+\.\d+ \(\+contato@example\.com\)$/,
    );
  });

  it("falha com erro claro quando CONTACT_EMAIL não está definido", () => {
    delete process.env.CONTACT_EMAIL;
    expect(() => buildUserAgent()).toThrow(/CONTACT_EMAIL/);
  });
});
