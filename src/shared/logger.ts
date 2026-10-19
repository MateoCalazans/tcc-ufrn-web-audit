import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Logs estruturados em JSON lines, um arquivo por módulo e por dia
 * (`logs/<modulo>-<AAAA-MM-DD>.jsonl`). Sem `console.log` solto no código.
 */
export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

const LOG_DIR = "logs";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createLogger(modulo: string): Logger {
  const file = join(LOG_DIR, `${modulo}-${today()}.jsonl`);

  function write(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        modulo,
        msg,
        ...fields,
      }) + "\n";
    try {
      mkdirSync(LOG_DIR, { recursive: true });
      appendFileSync(file, line, "utf8");
    } catch {
      // Logging nunca derruba o lote (CLAUDE.md): falha ao gravar é ignorada.
    }
  }

  return {
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
  };
}
