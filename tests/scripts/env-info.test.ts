import { describe, expect, it } from "vitest";

import {
  buildEnvInfo,
  parseVersion,
  TOOL_KEYS,
  type RawEnvInputs,
} from "../../scripts/env-info.js";
import type { Meta } from "../../src/shared/types.js";

const META: Meta = {
  generatedAt: "2026-10-19T12:00:00.000Z",
  toolVersions: { node: "24.19.0", lighthouse: null, playwright: null },
  gitCommit: "abc1234",
  gitDirty: false,
};

function inputs(overrides: Partial<RawEnvInputs> = {}): RawEnvInputs {
  return {
    meta: META,
    platform: "win32",
    release: "10.0.26200",
    arch: "x64",
    osType: "Windows_NT",
    cpuModel: "Fake CPU @ 3.00GHz",
    cpuCores: 8,
    totalMemoryBytes: 16 * 1024 ** 3,
    tools: {},
    ...overrides,
  };
}

describe("parseVersion", () => {
  it("extrai a versão da saída do Chrome", () => {
    expect(parseVersion("Google Chrome 130.0.6723.91 ")).toBe("130.0.6723.91");
  });

  it("extrai a versão do `node --version` (com prefixo v)", () => {
    expect(parseVersion("v24.19.0")).toBe("24.19.0");
  });

  it("extrai a versão do `java -version` (texto com aspas)", () => {
    const saida = 'openjdk version "21.0.1" 2023-10-17\nOpenJDK Runtime Environment';
    expect(parseVersion(saida)).toBe("21.0.1");
  });

  it("devolve null para entradas vazias ou ausentes", () => {
    expect(parseVersion("")).toBeNull();
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
  });

  it("devolve null quando não há número de versão", () => {
    expect(parseVersion("comando não encontrado")).toBeNull();
  });
});

describe("buildEnvInfo", () => {
  it("inclui toda chave de ferramenta, preenchendo ausências com null", () => {
    const info = buildEnvInfo(inputs({ tools: { node: "24.19.0", chrome: "130.0.6723.91" } }));
    for (const key of TOOL_KEYS) {
      expect(info.tools).toHaveProperty(key);
    }
    expect(info.tools.node).toBe("24.19.0");
    expect(info.tools.chrome).toBe("130.0.6723.91");
    expect(info.tools.lighthouse).toBeNull();
    expect(info.tools.java).toBeNull();
  });

  it("converte a RAM para GiB com 2 casas", () => {
    const info = buildEnvInfo(inputs({ totalMemoryBytes: 16 * 1024 ** 3 }));
    expect(info.memory.totalBytes).toBe(16 * 1024 ** 3);
    expect(info.memory.totalGiB).toBe(16);
  });

  it("mantém a RAM nula sem quebrar o cálculo de GiB", () => {
    const info = buildEnvInfo(inputs({ totalMemoryBytes: null }));
    expect(info.memory.totalBytes).toBeNull();
    expect(info.memory.totalGiB).toBeNull();
  });

  it("repassa SO, CPU e meta sem alterar", () => {
    const info = buildEnvInfo(inputs());
    expect(info.os).toEqual({
      platform: "win32",
      release: "10.0.26200",
      arch: "x64",
      type: "Windows_NT",
    });
    expect(info.cpu).toEqual({ model: "Fake CPU @ 3.00GHz", cores: 8 });
    expect(info.meta).toBe(META);
  });
});
