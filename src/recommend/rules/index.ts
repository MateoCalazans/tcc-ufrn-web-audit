import type { Rule } from "../../shared/types.js";
import { htmlLang } from "./html-lang.js";
import { imgDimensions } from "./img-dimensions.js";
import { metaViewport } from "./meta-viewport.js";

/**
 * Regras ativas, em ordem fixa: em conflito de edições, vence a que vem
 * antes (ADR 014). A ordem também define a ordem do `recommendations.json`.
 */
export const REGRAS: readonly Rule[] = [htmlLang, metaViewport, imgDimensions];
