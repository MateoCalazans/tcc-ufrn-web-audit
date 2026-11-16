import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Utilidades de leitura do repositório para os scripts da S19 (só leitura). */

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

export function arquivosVersionados(): string[] {
  return git(["ls-files", "-z"]).split("\0").filter(Boolean);
}

const IGNORAR = new Set([".git", "node_modules"]);

/** Todos os arquivos no disco, com `/`, sem `.git` e `node_modules`. */
export function arquivosNoDisco(dir = "."): string[] {
  const saida: string[] = [];
  const andar = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (IGNORAR.has(e.name)) continue;
      const p = d === "." ? e.name : `${d}/${e.name}`;
      if (e.isDirectory()) andar(p);
      else saida.push(p);
    }
  };
  andar(dir);
  return saida;
}

export interface Tag {
  nome: string;
  commit: string;
  data: string;
  assunto: string;
}

export function tags(): Tag[] {
  return git([
    "for-each-ref",
    "refs/tags",
    "--sort=creatordate",
    "--format=%(refname:short)%09%(*objectname:short)%09%(objectname:short)%09%(creatordate:short)%09%(contents:subject)",
  ])
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [nome, alvo, objeto, data, assunto] = l.split("\t") as [string, string, string, string, string];
      // tag anotada: `*objectname` é o commit apontado; tag leve: só `objectname`
      return { nome, commit: alvo || objeto, data, assunto };
    });
}

export function arquivosDe(dir: string, filtro: RegExp): string[] {
  return readdirSync(dir)
    .filter((f) => filtro.test(f))
    .sort()
    .map((f) => join(dir, f));
}
