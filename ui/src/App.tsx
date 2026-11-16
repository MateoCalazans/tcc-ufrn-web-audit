import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

import { LogoUfrn } from "./componentes/LogoUfrn";
import { TituloDaTela } from "./componentes/comum";
import { type Rota, lerRota, link } from "./lib/rotas";
import { gsap, iniciarRolagem, reduzido, topo } from "./movimento";
import { ListaCorpus } from "./telas/ListaCorpus";
import { NovaAnalise } from "./telas/NovaAnalise";
import { TelaAnalise } from "./telas/TelaAnalise";
import { TelaSite } from "./telas/TelaSite";

function useRota(): [Rota, string, (hash: string) => void] {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const ouvir = () => setHash(window.location.hash);
    window.addEventListener("hashchange", ouvir);
    return () => window.removeEventListener("hashchange", ouvir);
  }, []);
  return [lerRota(hash), hash, (h) => (window.location.hash = h)];
}

function Tela({ rota, navegar }: { rota: Rota; navegar: (hash: string) => void }) {
  switch (rota.tela) {
    case "lista":
      return <ListaCorpus />;
    case "site":
      return <TelaSite key={rota.id} id={rota.id} navegar={navegar} />;
    case "nova":
      return <NovaAnalise navegar={navegar} />;
    case "analise":
      return <TelaAnalise key={rota.id} id={rota.id} />;
    default:
      return (
        <>
          <TituloDaTela titulo="Página não encontrada">Página não encontrada</TituloDaTela>
          <p>
            <a href={link({ tela: "lista" })}>Voltar para a lista de sites</a>
          </p>
        </>
      );
  }
}

/**
 * Cabeçalho translúcido que fica compacto depois de rolar, com uma linha que
 * mostra quanto da página já foi lido.
 */
function useRolagemDoCabecalho(barra: RefObject<HTMLSpanElement | null>): boolean {
  const [rolado, setRolado] = useState(false);
  useEffect(() => {
    let pedido = 0;
    const medir = () => {
      pedido = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const f = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (barra.current) barra.current.style.transform = `scaleX(${f})`;
      setRolado(window.scrollY > 12);
    };
    const ouvir = () => {
      if (!pedido) pedido = requestAnimationFrame(medir);
    };
    window.addEventListener("scroll", ouvir, { passive: true });
    window.addEventListener("resize", ouvir);
    medir();
    return () => {
      window.removeEventListener("scroll", ouvir);
      window.removeEventListener("resize", ouvir);
      if (pedido) cancelAnimationFrame(pedido);
    };
  }, [barra]);
  return rolado;
}

export function App() {
  const [rota, hash, navegar] = useRota();
  const atual = (t: Rota["tela"]) => (rota.tela === t ? ("page" as const) : undefined);
  const barra = useRef<HTMLSpanElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const rolado = useRolagemDoCabecalho(barra);
  const cabecalho = useRef<HTMLElement>(null);

  // Altura real do cabeçalho fixo (duas linhas no celular, compacto ao rolar):
  // a barra de seções e a folga da rolagem usam esse valor.
  useEffect(() => {
    const el = cabecalho.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--topo-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => iniciarRolagem(), []);

  // Troca de tela: volta ao topo e o conteúdo entra com um fade curto.
  useLayoutEffect(() => {
    topo();
    const el = palco.current;
    if (!el || reduzido()) return;
    const t = gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", clearProps: "opacity,transform" });
    return () => {
      t.kill();
    };
  }, [hash]);

  return (
    <>
      <a
        className="pular"
        href="#conteudo"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("conteudo")?.focus();
        }}
      >
        Pular para o conteúdo
      </a>
      <header ref={cabecalho} className={`topo${rolado ? " rolado" : ""}`}>
        <div className="topo-interno">
          <a className="marca-casa" href={link({ tela: "lista" })}>
            <LogoUfrn titulo="UFRN" />
            <span className="marca-texto">
              <span className="marca-nome">Auditoria web</span>
              <span className="marca-curso">Tecnologia em Análise e Desenvolvimento de Sistemas, EAJ</span>
            </span>
          </a>
          <nav aria-label="Principal">
            <ul>
              <li>
                <a href={link({ tela: "lista" })} aria-current={atual("lista")}>
                  Sites da UFRN
                </a>
              </li>
              <li>
                <a href={link({ tela: "nova" })} aria-current={atual("nova")}>
                  Nova análise
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <span ref={barra} className="progresso-leitura" aria-hidden="true" />
      </header>
      <main id="conteudo" tabIndex={-1}>
        <div ref={palco} key={hash}>
          <Tela rota={rota} navegar={navegar} />
        </div>
      </main>
      <footer className="rodape">
        <div className="rodape-interno">
          <LogoUfrn titulo="Universidade Federal do Rio Grande do Norte" />
          <p>
            Análise automatizada de performance e semântica HTML em portais institucionais. Trabalho de conclusão do curso superior de Tecnologia em
            Análise e Desenvolvimento de Sistemas, na Escola Agrícola de Jundiaí (UFRN).
          </p>
          <p className="rodape-nota">
            A ferramenta roda só neste computador (<code>127.0.0.1</code>, ADR 017).
          </p>
        </div>
      </footer>
    </>
  );
}
