import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { buildMeta, getToolVersions } from "../src/shared/meta.js";
import { createLogger } from "../src/shared/logger.js";
import type { Meta } from "../src/shared/types.js";

const require = createRequire(import.meta.url);

/**
 * Registro do ambiente experimental (S01). Grava
 * `docs/ambiente/ambiente-<data>.json` com SO, CPU, RAM e versões das
 * ferramentas do pipeline. Esse arquivo alimenta a Metodologia do TCC — a
 * banca pergunta "em que máquina isso rodou?".
 *
 * Toda detecção é resiliente: uma ferramenta ausente vira `null` (nunca é
 * omitida, regra 10), e nenhuma falha de detecção derruba o script.
 */

/** Ferramentas cujas versões são sempre registradas (ausente → `null`). */
export const TOOL_KEYS = [
  "node",
  "npm",
  "chrome",
  "chromium",
  "lighthouse",
  "playwright",
  "java",
] as const;
export type ToolKey = (typeof TOOL_KEYS)[number];

export interface EnvInfo {
  meta: Meta;
  os: {
    platform: string;
    release: string;
    arch: string;
    type: string;
  };
  cpu: {
    model: string | null;
    cores: number | null;
  };
  memory: {
    totalBytes: number | null;
    totalGiB: number | null;
  };
  tools: Record<ToolKey, string | null>;
}

/** Entradas cruas de `buildEnvInfo` — tudo já coletado, para montar puro. */
export interface RawEnvInputs {
  meta: Meta;
  platform: string;
  release: string;
  arch: string;
  osType: string;
  cpuModel: string | null;
  cpuCores: number | null;
  totalMemoryBytes: number | null;
  tools: Partial<Record<ToolKey, string | null>>;
}

const BYTES_PER_GIB = 1024 ** 3;

/**
 * Monta o objeto de ambiente a partir de valores já coletados. Função pura:
 * garante que toda chave de ferramenta apareça (ausente → `null`) e deriva a
 * RAM em GiB. É a parte testável sem depender do que está instalado na máquina.
 */
export function buildEnvInfo(input: RawEnvInputs): EnvInfo {
  const tools = {} as Record<ToolKey, string | null>;
  for (const key of TOOL_KEYS) {
    tools[key] = input.tools[key] ?? null;
  }

  const totalBytes = input.totalMemoryBytes;
  const totalGiB =
    totalBytes === null ? null : Math.round((totalBytes / BYTES_PER_GIB) * 100) / 100;

  return {
    meta: input.meta,
    os: {
      platform: input.platform,
      release: input.release,
      arch: input.arch,
      type: input.osType,
    },
    cpu: {
      model: input.cpuModel,
      cores: input.cpuCores,
    },
    memory: {
      totalBytes,
      totalGiB,
    },
    tools,
  };
}

/** Semver-ish: um número com ao menos um ponto (ex.: `130.0.6723.91`). */
const DEFAULT_VERSION_RE = /\d+(?:\.\d+)+/;

/**
 * Extrai a primeira versão de uma saída de comando. Devolve `null` para
 * entradas vazias ou sem número de versão reconhecível.
 */
export function parseVersion(
  output: string | null | undefined,
  pattern: RegExp = DEFAULT_VERSION_RE,
): string | null {
  if (!output) return null;
  const match = output.match(pattern);
  return match ? match[0] : null;
}

/**
 * Roda um comando e devolve `stdout`+`stderr` combinados, ou `null` se o
 * binário não existir ou a execução falhar. Captura `stderr` de propósito:
 * `java -version`, por exemplo, escreve a versão na saída de erro.
 *
 * A linha vai como string única com `shell: true` — forma que resolve
 * wrappers `.cmd` no Windows (ex.: `npm`) sem o aviso DEP0190 de passar um
 * array de `args` junto com `shell`. Só comandos constantes deste arquivo
 * chegam aqui (sem entrada externa), então não há superfície de injeção.
 */
function runCommand(command: string): string | null {
  try {
    const result = spawnSync(command, {
      encoding: "utf8",
      timeout: 5000,
      shell: true,
    });
    if (result.error) return null;
    const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** Google Chrome do sistema (o que o Lighthouse usa via chrome-launcher). */
function detectChrome(): string | null {
  const attempts = [
    "google-chrome --version",
    "google-chrome-stable --version",
    "chrome --version",
  ];
  for (const command of attempts) {
    const version = parseVersion(runCommand(command));
    if (version) return version;
  }
  if (process.platform === "win32") {
    // Chrome registra a versão instalada nesta chave.
    const reg = runCommand('reg query "HKCU\\Software\\Google\\Chrome\\BLBeacon" /v version');
    const version = parseVersion(reg);
    if (version) return version;
  }
  return null;
}

/**
 * Versão do Chromium que o Playwright usa, lida de `playwright-core/
 * browsers.json` (campo `browserVersion`). Esse é o navegador que renderiza o
 * DOM / screenshot / HAR na coleta, então é o que importa reproduzir.
 */
function playwrightChromiumVersion(): string | null {
  try {
    // `require("playwright-core/browsers.json")` é bloqueado pelo `exports` do
    // pacote; então resolvemos o módulo e lemos o arquivo ao lado dele.
    let dir = dirname(require.resolve("playwright-core"));
    for (let i = 0; i < 6; i++) {
      const candidate = join(dir, "browsers.json");
      if (existsSync(candidate)) {
        const data = JSON.parse(readFileSync(candidate, "utf8")) as {
          browsers?: Array<{ name?: string; browserVersion?: string }>;
        };
        const chromium = data.browsers?.find((b) => b.name === "chromium");
        return chromium?.browserVersion ?? null;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Chromium do projeto. Reporta o que o Playwright traz (o usado na coleta);
 * se o Playwright não estiver instalado, tenta um Chromium de sistema no PATH.
 */
function detectChromium(): string | null {
  const bundled = playwrightChromiumVersion();
  if (bundled) return bundled;
  for (const command of ["chromium --version", "chromium-browser --version"]) {
    const version = parseVersion(runCommand(command));
    if (version) return version;
  }
  return null;
}

/** Coleta tudo da máquina real e delega a montagem a `buildEnvInfo`. */
export function gatherEnvInfo(): EnvInfo {
  const cpus = os.cpus();
  const toolVersions = getToolVersions();

  return buildEnvInfo({
    meta: buildMeta(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    osType: os.type(),
    cpuModel: cpus[0]?.model.trim() ?? null,
    cpuCores: cpus.length || null,
    totalMemoryBytes: os.totalmem() || null,
    tools: {
      node: toolVersions.node,
      npm: parseVersion(runCommand("npm --version")),
      chrome: detectChrome(),
      chromium: detectChromium(),
      lighthouse: toolVersions.lighthouse,
      playwright: toolVersions.playwright,
      java: parseVersion(runCommand("java -version")),
    },
  });
}

/** Caminho de saída do registro do dia (`docs/ambiente/ambiente-<data>.json`). */
export function outputPath(date: string): string {
  return join("docs", "ambiente", `ambiente-${date}.json`);
}

function main(): void {
  const log = createLogger("env");
  const info = gatherEnvInfo();
  const date = info.meta.generatedAt.slice(0, 10);
  const file = outputPath(date);

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(info, null, 2)}\n`, "utf8");

  log.info("ambiente registrado", { file, tools: info.tools });

  // Resumo legível para quem rodou o comando (script operacional, saída única).
  process.stdout.write(`Ambiente gravado em ${file}\n`);
  for (const key of TOOL_KEYS) {
    process.stdout.write(`  ${key.padEnd(11)} ${info.tools[key] ?? "(não detectado)"}\n`);
  }
}

// Só executa quando chamado diretamente (`npm run env`); importar em testes não dispara a gravação.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
