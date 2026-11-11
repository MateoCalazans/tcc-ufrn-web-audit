import { describe, expect, it } from "vitest";

import { type Executar, lerSaidaVnu, opcoesVnu, prepararVnu, versaoPrincipalJava } from "../../src/analyze/vnu.js";

/** Validação HTML opcional (S11, ADR 011, item 8). O `java` é simulado: nenhum processo real roda. */

const JAVA8 = 'java version "1.8.0_481"\nJava(TM) SE Runtime Environment';
const JAVA17 = 'openjdk version "17.0.12" 2024-07-16';
const SAIDA_VNU = JSON.stringify({
  messages: [
    { type: "error", message: "Stray end tag div." },
    { type: "error", message: "Duplicate ID x." },
    { type: "info", subType: "warning", message: "Consider adding a lang attribute." },
    { type: "info", message: "Trailing slash on void elements." },
  ],
});

/** Simula o `java`: `-version` devolve `versao` no stderr; o resto, as respostas dadas. */
function javaFalso(versao: string, chamadas: string[][] = []): Executar {
  return (cmd, args) => {
    chamadas.push([cmd, ...args]);
    if (args[0] === "-version") return { status: 0, stdout: "", stderr: versao };
    if (args.includes("--version")) return { status: 0, stdout: "26.4.11\n", stderr: "" };
    return { status: 1, stdout: SAIDA_VNU, stderr: "" };
  };
}
const existe = () => true;

describe("versaoPrincipalJava", () => {
  it("lê o formato antigo (1.x) e o novo", () => {
    expect(versaoPrincipalJava(JAVA8)).toBe(8);
    expect(versaoPrincipalJava(JAVA17)).toBe(17);
    expect(versaoPrincipalJava('openjdk version "21" 2023-09-19')).toBe(21);
    expect(versaoPrincipalJava("lixo")).toBeNull();
  });
});

describe("lerSaidaVnu", () => {
  it("conta erros e avisos (info com subType warning); info simples não conta", () => {
    expect(lerSaidaVnu(SAIDA_VNU)).toEqual({ erros: 2, avisos: 1 });
  });

  it("non-document-error e JSON inválido viram falha", () => {
    expect(lerSaidaVnu(JSON.stringify({ messages: [{ type: "non-document-error", message: "IO" }] }))).toEqual({
      falha: "non-document-error: IO",
    });
    expect(lerSaidaVnu("not json")).toHaveProperty("falha");
  });
});

describe("opcoesVnu", () => {
  it("sem --vnu devolve null", () => {
    expect(opcoesVnu([], { VNU_JAR: "x.jar" })).toBeNull();
  });

  it("--vnu-jar vale mais que VNU_JAR", () => {
    expect(opcoesVnu(["--vnu", "--vnu-jar", "a.jar"], { VNU_JAR: "b.jar" })).toEqual({ jar: "a.jar" });
    expect(opcoesVnu(["--vnu"], { VNU_JAR: "b.jar" })).toEqual({ jar: "b.jar" });
    expect(opcoesVnu(["--vnu"], {})).toEqual({ jar: null });
  });
});

describe("prepararVnu", () => {
  it("Java 8 (o desta máquina na S11) → indisponível, sem chamar o jar", () => {
    const chamadas: string[][] = [];
    const v = prepararVnu({ jar: "vnu.jar" }, javaFalso(JAVA8, chamadas), existe);
    expect(v).toEqual({ disponivel: false, motivo: "Java 8 < 17 (exigido pelo vnu.jar)" });
    expect(chamadas).toEqual([["java", "-version"]]);
  });

  it("sem jar ou jar inexistente → indisponível", () => {
    expect(prepararVnu({ jar: null }, javaFalso(JAVA17), existe).disponivel).toBe(false);
    expect(prepararVnu({ jar: "nao.jar" }, javaFalso(JAVA17), () => false)).toEqual({
      disponivel: false,
      motivo: "vnu.jar não encontrado: nao.jar",
    });
  });

  it("java ausente → indisponível com o erro", () => {
    const semJava: Executar = () => ({ status: null, stdout: "", stderr: "", erro: "spawn java ENOENT" });
    expect(prepararVnu({ jar: "vnu.jar" }, semJava, existe)).toEqual({ disponivel: false, motivo: "java não executou: spawn java ENOENT" });
  });

  it("Java 17 → valida o arquivo; código de saída 1 (há erros) não é falha", () => {
    const chamadas: string[][] = [];
    const v = prepararVnu({ jar: "vnu.jar" }, javaFalso(JAVA17, chamadas), existe);
    expect(v.disponivel).toBe(true);
    if (!v.disponivel) return;
    expect(v.validar("data/raw/x/rendered.html")).toEqual({ status: "ok", versao: "26.4.11", erros: 2, avisos: 1 });
    expect(chamadas.at(-1)).toEqual(["java", "-jar", "vnu.jar", "--format", "json", "--stdout", "data/raw/x/rendered.html"]);
  });
});
