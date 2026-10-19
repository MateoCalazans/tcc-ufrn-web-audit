import pLimit from "p-limit";

import { readPackageJson } from "./pkg.js";

/**
 * Limitador de requisições que faz cumprir as regras éticas do CLAUDE.md:
 *
 *  1. No máximo 2 requisições simultâneas no total.
 *  2. No máximo 1 requisição simultânea por host.
 *  3. Pausa mínima de 2 s entre requisições ao mesmo host (medida entre os
 *     *inícios* de duas requisições consecutivas ao mesmo host).
 *
 * `now` e `sleep` são injetáveis para permitir testes determinísticos sem
 * esperas reais.
 */
export interface HostLimiterOptions {
  /** Concorrência global máxima. Padrão: 2. */
  maxConcurrent?: number;
  /** Intervalo mínimo entre requisições ao mesmo host, em ms. Padrão: 2000. */
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class HostLimiter {
  private readonly global: ReturnType<typeof pLimit>;
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  /** Fila (cauda de promessa) por host: garante no máx. 1 por host por vez. */
  private readonly tails = new Map<string, Promise<unknown>>();
  /** Instante do último início de requisição por host (para o espaçamento). */
  private readonly lastStart = new Map<string, number>();

  constructor(options: HostLimiterOptions = {}) {
    this.global = pLimit(options.maxConcurrent ?? 2);
    this.minIntervalMs = options.minIntervalMs ?? 2000;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? realSleep;
  }

  /**
   * Agenda uma tarefa associada a um host, respeitando as três regras.
   * Devolve a promessa do resultado da tarefa.
   */
  schedule<T>(host: string, task: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      // Regra 3: espaçamento desde o último início neste host.
      const last = this.lastStart.get(host);
      if (last !== undefined) {
        const wait = this.minIntervalMs - (this.now() - last);
        if (wait > 0) await this.sleep(wait);
      }
      // Regra 1: concorrência global; o início conta após obter a vaga.
      return this.global(async () => {
        this.lastStart.set(host, this.now());
        return task();
      });
    };

    // Regra 2: encadeia por host para que só uma rode por host de cada vez.
    const prevTail = this.tails.get(host) ?? Promise.resolve();
    const resultP = prevTail.then(run, run);
    // A cauda nunca rejeita, para que uma falha não quebre a fila do host.
    const tail = resultP.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(host, tail);
    // Quando esta for a última tarefa da fila, remove a entrada de `tails`
    // (libera a promessa já resolvida). `lastStart` é mantido de propósito:
    // o espaçamento precisa valer também entre requisições sequenciais ao
    // mesmo host, não só entre as concorrentes.
    void tail.then(() => {
      if (this.tails.get(host) === tail) {
        this.tails.delete(host);
      }
    });
    return resultP;
  }
}

/** Limitador compartilhado por todo o pipeline. */
export const defaultLimiter = new HostLimiter();

/**
 * User-Agent identificado (regra 2 do CLAUDE.md): nome + versão do
 * package.json e contato de `CONTACT_EMAIL`. Falha explicitamente se o
 * contato não estiver definido — nunca envia requisição sem contato.
 */
export function buildUserAgent(): string {
  const { version } = readPackageJson();
  const contato = process.env.CONTACT_EMAIL?.trim();
  if (!contato) {
    throw new Error(
      "CONTACT_EMAIL não definido. Defina-o no .env (veja .env.example) " +
        "antes de fazer requisições — o User-Agent precisa de um contato.",
    );
  }
  return `TCC-EAJ-UFRN-Audit/${version} (+${contato})`;
}

export interface HttpResult {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface HttpOptions {
  /** Timeout em ms. Padrão: 15000 (critério "timeout" do ADR 002). */
  timeoutMs?: number;
  /** Cabeçalhos extras. */
  headers?: Record<string, string>;
  limiter?: HostLimiter;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * GET de texto respeitando o limitador por host, o User-Agent identificado e
 * o timeout. Segue redirects (a cadeia é analisada por quem chama via `url`).
 */
export async function httpGetText(url: string, options: HttpOptions = {}): Promise<HttpResult> {
  const limiter = options.limiter ?? defaultLimiter;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const host = new URL(url).host;
  const userAgent = buildUserAgent();

  return limiter.schedule(host, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": userAgent, ...options.headers },
      });
      const body = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return { url: res.url, status: res.status, headers, body };
    } finally {
      clearTimeout(timer);
    }
  });
}
