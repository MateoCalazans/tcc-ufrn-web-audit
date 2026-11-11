import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Validação HTML com o Nu Html Checker (`vnu.jar`), **opcional** (ADR 011,
 * item 8): só roda com a flag `--vnu`. Precisa de Java 17 ou mais novo
 * (README do validator/validator). Sem Java compatível ou sem o `.jar`, a
 * análise segue e cada site recebe `{ status: "indisponivel", motivo }`.
 *
 * O `.jar` não é dependência do projeto: o caminho vem de `--vnu-jar <arquivo>`
 * ou da variável `VNU_JAR`.
 */

export const JAVA_MINIMO = 17;

export type ResultadoVnu =
  | { status: "ok"; versao: string | null; erros: number; avisos: number }
  | { status: "indisponivel"; motivo: string }
  | { status: "falha"; motivo: string };

export type Vnu =
  | { disponivel: true; versao: string | null; validar: (arquivo: string) => ResultadoVnu }
  | { disponivel: false; motivo: string };

export interface SaidaProcesso {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Erro ao iniciar o processo (ex.: `java` não encontrado). */
  erro?: string;
}
export type Executar = (cmd: string, args: string[]) => SaidaProcesso;

export const executarPadrao: Executar = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", erro: r.error?.message };
};

/** Versão principal do Java a partir da saída de `java -version` (`1.8.0_481` → 8, `17.0.2` → 17). */
export function versaoPrincipalJava(saida: string): number | null {
  const m = /version "(\d+)(?:\.(\d+))?/.exec(saida);
  if (!m) return null;
  const a = Number(m[1]);
  return a === 1 && m[2] !== undefined ? Number(m[2]) : a;
}

/** Conta erros e avisos no JSON do vnu (`--format json`). Mensagem `non-document-error` vira falha. */
export function lerSaidaVnu(json: string): { erros: number; avisos: number } | { falha: string } {
  let dados: { messages?: Array<{ type?: string; subType?: string; message?: string }> };
  try {
    dados = JSON.parse(json);
  } catch {
    return { falha: "saída do vnu não é JSON" };
  }
  const msgs = dados.messages ?? [];
  const naoDoc = msgs.find((m) => m.type === "non-document-error");
  if (naoDoc) return { falha: `non-document-error: ${naoDoc.message ?? ""}`.trim() };
  return {
    erros: msgs.filter((m) => m.type === "error").length,
    avisos: msgs.filter((m) => m.type === "info" && m.subType === "warning").length,
  };
}

/** Lê `--vnu` e o caminho do `.jar` (`--vnu-jar <arquivo>` ou `VNU_JAR`). `null` = flag ausente. */
export function opcoesVnu(argv: string[], env: NodeJS.ProcessEnv): { jar: string | null } | null {
  if (!argv.includes("--vnu")) return null;
  const i = argv.indexOf("--vnu-jar");
  const jar = i >= 0 ? (argv[i + 1] ?? null) : (env.VNU_JAR ?? null);
  return { jar: jar && jar.trim() !== "" ? jar : null };
}

/** Verifica Java e `.jar` uma vez por lote e devolve o validador (ou o motivo de não ter). */
export function prepararVnu(
  opcoes: { jar: string | null },
  executar: Executar = executarPadrao,
  existe: (f: string) => boolean = existsSync,
): Vnu {
  if (opcoes.jar === null) return { disponivel: false, motivo: "caminho do vnu.jar não informado (--vnu-jar ou VNU_JAR)" };
  if (!existe(opcoes.jar)) return { disponivel: false, motivo: `vnu.jar não encontrado: ${opcoes.jar}` };
  const java = executar("java", ["-version"]);
  if (java.erro) return { disponivel: false, motivo: `java não executou: ${java.erro}` };
  const v = versaoPrincipalJava(java.stderr + java.stdout);
  if (v === null) return { disponivel: false, motivo: "versão do Java não reconhecida" };
  if (v < JAVA_MINIMO) return { disponivel: false, motivo: `Java ${v} < ${JAVA_MINIMO} (exigido pelo vnu.jar)` };
  const jar = opcoes.jar;
  const ver = executar("java", ["-jar", jar, "--version"]);
  const versao = ver.status === 0 ? ver.stdout.trim() || null : null;
  return {
    disponivel: true,
    versao,
    validar: (arquivo) => {
      // O vnu sai com código 1 quando há erros de validação: não é falha de execução.
      const r = executar("java", ["-jar", jar, "--format", "json", "--stdout", arquivo]);
      if (r.erro) return { status: "falha", motivo: r.erro };
      const lido = lerSaidaVnu(r.stdout);
      return "falha" in lido ? { status: "falha", motivo: lido.falha } : { status: "ok", versao, ...lido };
    },
  };
}
