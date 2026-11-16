import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";

/**
 * Movimento das telas, num lugar só: plugins do GSAP, rolagem suave (Lenis)
 * e a regra de movimento reduzido. Fora do navegador (testes em jsdom), nada
 * anima.
 */

// O ScrollTrigger usa matchMedia ao se registrar; o jsdom dos testes não tem.
if (typeof window !== "undefined" && typeof window.matchMedia === "function") gsap.registerPlugin(ScrollTrigger, SplitText);

export { gsap, ScrollTrigger, SplitText };

export const EASE = "expo.out";

/** Sem animação: testes (jsdom) ou pedido de movimento reduzido. */
export function reduzido(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let lenis: Lenis | null = null;

/** Liga a rolagem suave, sincronizada com o ScrollTrigger. Só sem movimento reduzido. */
export function iniciarRolagem(): () => void {
  if (reduzido() || lenis) return () => {};
  lenis = new Lenis({ duration: 1.05, easing: (t) => 1 - Math.pow(1 - t, 3.2), anchors: false });
  lenis.on("scroll", ScrollTrigger.update);
  const tick = (tempo: number) => lenis?.raf(tempo * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return () => {
    gsap.ticker.remove(tick);
    lenis?.destroy();
    lenis = null;
  };
}

/** Folga para o que fica fixo no topo: o cabeçalho e a barra de seções. */
function folgaDoTopo(): number {
  const topo = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topo-h")) || 60;
  const barra = document.querySelector<HTMLElement>(".barra-secoes")?.offsetHeight ?? 0;
  return topo + barra + 16;
}

/** Rola até um elemento (pela rolagem suave, se ligada), com folga para o cabeçalho e a barra fixos. */
export function rolarPara(el: HTMLElement, folga = folgaDoTopo()): void {
  if (lenis) {
    lenis.scrollTo(el, { offset: -folga });
    return;
  }
  const y = el.getBoundingClientRect().top + window.scrollY - folga;
  window.scrollTo({ top: y, behavior: reduzido() ? "auto" : "smooth" });
}

/** Volta ao topo na troca de tela, sem animar. */
export function topo(): void {
  if (lenis) lenis.scrollTo(0, { immediate: true });
  else window.scrollTo(0, 0);
}
