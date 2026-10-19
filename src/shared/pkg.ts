import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Lê o package.json da raiz do projeto, subindo a partir deste arquivo até
 * encontrá-lo. Evita depender de `process.cwd()` (que muda conforme de onde
 * o comando é chamado) e dispensa `import ... with { type: "json" }`.
 */
export interface PackageJson {
  name: string;
  version: string;
  [key: string]: unknown;
}

let cached: PackageJson | undefined;

export function readPackageJson(): PackageJson {
  if (cached) return cached;

  let dir = dirname(fileURLToPath(import.meta.url));
  // Sobe no máximo alguns níveis procurando o package.json da raiz.
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "package.json");
    try {
      const raw = readFileSync(candidate, "utf8");
      cached = JSON.parse(raw) as PackageJson;
      return cached;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error("package.json não encontrado a partir de src/shared/pkg.ts");
}
