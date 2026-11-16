import type { Rule } from "../../shared/types.js";
import { fakeButton } from "./fake-button.js";
import { headingSkip } from "./heading-skip.js";
import { htmlLang } from "./html-lang.js";
import { imgDimensions } from "./img-dimensions.js";
import { imgLazy } from "./img-lazy.js";
import { metaViewport } from "./meta-viewport.js";
import { obsoleteTags } from "./obsolete-tags.js";
import { renderBlockingHint } from "./render-blocking-hint.js";

/**
 * Regras ativas, em ordem fixa: em conflito de edições, vence a que vem
 * antes (ADR 014). A ordem também define a ordem do `recommendations.json`.
 * S14: as 3 primeiras; S15: as 5 seguintes (ADR 015).
 */
export const REGRAS: readonly Rule[] = [
  htmlLang,
  metaViewport,
  imgDimensions,
  imgLazy,
  obsoleteTags,
  headingSkip,
  fakeButton,
  renderBlockingHint,
];
