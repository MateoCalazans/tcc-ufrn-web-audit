import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * Validação HTML com o Nu Html Checker (`vnu.jar`), **opcional** (ADR 011,
 * item 8): só roda com a flag `--vnu`. Precisa de Java 17 ou mais novo
 * (README do validator/validator). Sem Java compatível ou sem o `.jar`, a
 * análise segue e cada site recebe `{ status: "indisponivel", motivo }`.
 *
 * O `.jar` vem de `--vnu-jar <arquivo>`, senão da variável `VNU_JAR`, senão
 * do pacote `vnu-jar` (devDependency com versão fixa, registrada nos metadados). O Java vem de `--vnu-java <executável>`, senão de
 * `$JAVA_HOME/bin/java`, senão do `java` do PATH (na máquina da S11, o PATH
 * achava primeiro um Java 8, e o `JAVA_HOME` apontava para o JDK 24).
 */

export const JAVA_MINIMO = 17;

export type ResultadoVnu =
  | { status: "ok"; versao: string | null; erros: number; avisos: number }
  | { status: "indisponivel"; motivo: string }
  | { status: "falha"; motivo: string };

export type Vnu =
  | { disponivel: true; versao: string | null; java: number; validar: (arquivo: string) => ResultadoVnu }
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

export interface OpcoesVnu {
  jar: string | null;
  /** Executável do Java. */
  java: string;
}

/** Caminho do `vnu.jar` do pacote `vnu-jar`; `null` se não estiver instalado. */
export function jarDoPacote(): string | null {
  try {
    return String(createRequire(import.meta.url)("vnu-jar"));
  } catch {
    return null;
  }
}

/** Lê `--vnu`, o `.jar` e o Java (ver o comentário do módulo). `null` = flag ausente. */
export function opcoesVnu(
  argv: string[],
  env: NodeJS.ProcessEnv,
  jarPadrao: () => string | null = jarDoPacote,
): OpcoesVnu | null {
  if (!argv.includes("--vnu")) return null;
  const arg = (nome: string): string | null => {
    const i = argv.indexOf(nome);
    const v = i >= 0 ? argv[i + 1] : undefined;
    return v && v.trim() !== "" ? v : null;
  };
  const jarEnv = env.VNU_JAR && env.VNU_JAR.trim() !== "" ? env.VNU_JAR : null;
  const javaHome = env.JAVA_HOME && env.JAVA_HOME.trim() !== "" ? join(env.JAVA_HOME, "bin", "java") : null;
  return { jar: arg("--vnu-jar") ?? jarEnv ?? jarPadrao(), java: arg("--vnu-java") ?? javaHome ?? "java" };
}

/** Verifica Java e `.jar` uma vez por lote e devolve o validador (ou o motivo de não ter). */
export function prepararVnu(
  opcoes: { jar: string | null; java?: string },
  executar: Executar = executarPadrao,
  existe: (f: string) => boolean = existsSync,
): Vnu {
  if (opcoes.jar === null) return { disponivel: false, motivo: "vnu.jar não encontrado (--vnu-jar, VNU_JAR ou pacote vnu-jar)" };
  if (!existe(opcoes.jar)) return { disponivel: false, motivo: `vnu.jar não encontrado: ${opcoes.jar}` };
  const bin = opcoes.java ?? "java";
  const java = executar(bin, ["-version"]);
  if (java.erro) return { disponivel: false, motivo: `java não executou: ${java.erro}` };
  const v = versaoPrincipalJava(java.stderr + java.stdout);
  if (v === null) return { disponivel: false, motivo: "versão do Java não reconhecida" };
  if (v < JAVA_MINIMO) return { disponivel: false, motivo: `Java ${v} < ${JAVA_MINIMO} (exigido pelo vnu.jar)` };
  const jar = opcoes.jar;
  const ver = executar(bin, ["-jar", jar, "--version"]);
  const versao = ver.status === 0 ? ver.stdout.trim() || null : null;
  return {
    disponivel: true,
    versao,
    java: v,
    validar: (arquivo) => {
      // O vnu sai com código 1 quando há erros de validação: não é falha de execução.
      const r = executar(bin, ["-jar", jar, "--format", "json", "--stdout", arquivo]);
      if (r.erro) return { status: "falha", motivo: r.erro };
      const lido = lerSaidaVnu(r.stdout);
      return "falha" in lido ? { status: "falha", motivo: lido.falha } : { status: "ok", versao, ...lido };
    },
  };
}
