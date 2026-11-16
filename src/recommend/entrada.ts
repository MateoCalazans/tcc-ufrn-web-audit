import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { escolherExecucao } from "../analyze/performance.js";
import { LH_RECORD, type LighthouseRecord, lhRunFile } from "../collect/lighthouse.js";
import type { Har, LhrRegras } from "../shared/types.js";
import { decodificar, type Texto } from "./encoding.js";
import type { EntradaMotor } from "./engine.js";

/**
 * Lê de `data/raw/<id>/` o que o motor de regras recebe (S14/S15): HTML bruto
 * decodificado, URL do `collect.json`, `page.har` e o `lh<n>.json` da execução
 * mediana (ADR 009). Usado pelo módulo 3 e pela seleção da amostra (S18), para
 * que as duas contem as correções sobre as mesmas entradas.
 */
export interface EntradaDoSite {
  entrada: EntradaMotor;
  fonte: Texto;
  /** `lh<n>.json` usado, ou `null` sem execução válida. */
  lhArquivo: string | null;
}

export function lerEntradaDoSite(dir: string, id: string): EntradaDoSite {
  const bruto = join(dir, "index.html");
  if (!existsSync(bruto)) throw new Error("sem index.html (HTML bruto) na coleta");
  const { url } = JSON.parse(readFileSync(join(dir, "collect.json"), "utf8")) as { url: string };
  const fonte = decodificar(readFileSync(bruto));
  const harPath = join(dir, "page.har");
  const har = existsSync(harPath) ? (JSON.parse(readFileSync(harPath, "utf8")) as Har) : undefined;

  // Sem execução válida, as regras que dependem do Lighthouse não acusam nada.
  let lighthouse: LhrRegras | undefined;
  let lhArquivo: string | null = null;
  if (existsSync(join(dir, LH_RECORD))) {
    const { execucao } = escolherExecucao(JSON.parse(readFileSync(join(dir, LH_RECORD), "utf8")) as LighthouseRecord);
    if (execucao !== null && existsSync(join(dir, lhRunFile(execucao)))) {
      lhArquivo = lhRunFile(execucao);
      lighthouse = JSON.parse(readFileSync(join(dir, lhArquivo), "utf8")) as LhrRegras;
    }
  }
  return { entrada: { siteId: id, url, html: fonte.texto, har, lighthouse }, fonte, lhArquivo };
}
