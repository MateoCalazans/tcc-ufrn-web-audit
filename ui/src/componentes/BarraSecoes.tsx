import { useEffect, useState } from "react";

import { rolarPara } from "../movimento";

export interface Secao {
  /** id do título (h2) da seção. */
  id: string;
  rotulo: string;
  contagem?: number;
}

/**
 * Barra fixa com as seções do painel. São botões, não links: um `#âncora`
 * mudaria a rota (as rotas ficam no hash). Clicar rola até o título e move o
 * foco para ele. A seção visível fica marcada.
 */
export function BarraSecoes({ secoes }: { secoes: Secao[] }) {
  const [atual, setAtual] = useState<string | null>(secoes[0]?.id ?? null);

  // Seção atual: a última cujo título já passou de 40% da altura da tela.
  useEffect(() => {
    let pedido = 0;
    const medir = () => {
      pedido = 0;
      const limite = window.innerHeight * 0.4;
      let id = secoes[0]?.id ?? null;
      for (const s of secoes) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= limite) id = s.id;
      }
      setAtual(id);
    };
    const ouvir = () => {
      if (!pedido) pedido = requestAnimationFrame(medir);
    };
    window.addEventListener("scroll", ouvir, { passive: true });
    window.addEventListener("resize", ouvir);
    return () => {
      window.removeEventListener("scroll", ouvir);
      window.removeEventListener("resize", ouvir);
      if (pedido) cancelAnimationFrame(pedido);
    };
  }, [secoes]);

  function ir(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    rolarPara(el);
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    setAtual(id);
  }

  return (
    <nav className="barra-secoes" aria-label="Seções deste site">
      <ul>
        {secoes.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => ir(s.id)} aria-current={atual === s.id ? "true" : undefined}>
              {s.rotulo}
              {s.contagem !== undefined && <span className="barra-contagem">{s.contagem}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
