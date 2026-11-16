import { useLayoutEffect, useRef } from "react";

import { ROTULO_FAIXA, faixaLighthouse, fmtIndice, fmtInteiro } from "../lib/formato";
import { EASE, gsap, reduzido } from "../movimento";
import type { Metricas } from "../tipos";

const NOTAS_LH = [
  ["performance", "Performance"],
  ["accessibility", "Acessibilidade"],
  ["best-practices", "Boas práticas"],
  ["seo", "SEO"],
] as const;

/**
 * Régua de 0 a 100 com as faixas do Lighthouse (0–49, 50–89, 90–100) e a
 * marca da nota. A posição é só visual; o número e a faixa estão no texto.
 */
function Regua({ valor }: { valor: number | null }) {
  return (
    <span className="regua" aria-hidden="true">
      <span className="regua-faixa regua-ruim" />
      <span className="regua-faixa regua-media" />
      <span className="regua-faixa regua-boa" />
      {valor !== null && <span className="regua-marca" style={{ left: `${Math.max(0, Math.min(100, valor))}%` }} />}
    </span>
  );
}

/** Índice composto de semântica (ADR 003) e as 4 notas do Lighthouse (mediana, ADR 009). */
export function Notas({ m }: { m: Metricas }) {
  const notas = m.performance?.metricas?.notas ?? {};
  const indice = m.indice?.indice ?? null;
  const ref = useRef<HTMLElement>(null);

  // Uma vez, ao entrar na tela: o índice conta até o valor e as marcas das
  // réguas deslizam do 0 até a nota. O número real fica no texto para leitor
  // de tela; o que conta é só visual.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduzido()) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ paused: true, defaults: { ease: EASE } });
      const visor = el.querySelector<HTMLElement>(".indice-contador");
      if (visor && indice !== null) {
        const o = { v: 0 };
        visor.textContent = fmtIndice(0);
        tl.to(o, { v: indice, duration: 1.4, onUpdate: () => (visor.textContent = fmtIndice(o.v)) }, 0);
      }
      tl.from(".regua-marca", { left: "0%", duration: 1.2, stagger: 0.08 }, 0.1);
      tl.from(".nota-valor", { opacity: 0, y: 8, duration: 0.6, stagger: 0.08 }, 0.15);
      gsap.timeline({ scrollTrigger: { trigger: el, start: "top 80%", once: true, onEnter: () => tl.play() } });
    }, el);
    return () => ctx.revert();
  }, [indice]);

  return (
    <section ref={ref} aria-labelledby="titulo-notas" className="leitura">
      <h2 id="titulo-notas">Notas</h2>
      <div className="leitura-corpo">
        <div className="leitura-indice">
          <p className="indice-numero">
            <span className="so-leitor">{fmtIndice(indice)}</span>
            <span className="indice-contador" aria-hidden="true">
              {fmtIndice(indice)}
            </span>
          </p>
          <p className="indice-texto">
            Índice de semântica, de 0 a 100, com os pesos do ADR 003. Com pesos iguais, ficaria em {fmtIndice(m.indice?.indicePesosIguais)}.
          </p>
        </div>
        <ul className="leitura-notas">
          {NOTAS_LH.map(([chave, rotulo]) => {
            const v = notas[chave] ?? null;
            const faixa = faixaLighthouse(v);
            return (
              <li key={chave} className={faixa ? `nota-linha faixa-${faixa}` : "nota-linha"}>
                <span className="nota-nome">{rotulo}</span>
                <span className="nota-valor">{fmtInteiro(v)}</span>
                <Regua valor={v} />
                <span className="nota-faixa">{faixa ? `Faixa ${ROTULO_FAIXA[faixa]} no Lighthouse` : "Sem nota do Lighthouse"}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
