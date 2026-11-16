import { readFileSync } from "node:fs";
import { join } from "node:path";

import { aplicarRegras } from "../../src/recommend/engine.js";
import type { Har, LhrRegras, Rule } from "../../src/shared/types.js";

export const FIX = join("tests", "fixtures", "recommend");
export const ler = (f: string) => readFileSync(join(FIX, f), "utf8");
export const rodar = (regra: Rule, html: string, extra: { har?: Har; lighthouse?: LhrRegras } = {}) =>
  aplicarRegras({ siteId: "exemplo.ufrn.br", url: "https://exemplo.ufrn.br/", html, ...extra }, [regra]);

/** Relatório mínimo do Lighthouse com as auditorias dadas. */
export function lhr(audits: LhrRegras["audits"]): LhrRegras {
  return { lighthouseVersion: "13.5.0", audits };
}

/** `lcp-discovery-insight` com o nó LCP dado (formato do Lighthouse 13). */
export function lcp(snippet: string): LhrRegras["audits"] {
  return {
    "lcp-discovery-insight": {
      score: 0,
      details: {
        items: [
          { type: "checklist", items: {} },
          { type: "node", path: "1,HTML,1,BODY,7,IMG", selector: "body > img", snippet },
        ],
      },
    },
  };
}
