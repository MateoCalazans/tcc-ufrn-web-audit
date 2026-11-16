import gsap from "gsap";
import { type PointerEvent as EventoPonteiro, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { fmtIndice, fmtInteiro } from "../lib/formato";
import { type DadosMapa, GEOMETRIA_ESTREITA, GEOMETRIA_GRANDE, GEOMETRIA_MINI, escala } from "../lib/mapa";

const LADO = { grande: 8, mini: 6 } as const;
const TICKS_X = [0, 50, 90, 100];
const TICKS_Y = [0, 25, 50, 75, 100];

const ESTREITO = "(max-width: 44rem)";

/** Tela estreita (celular): o mapa grande troca de geometria. */
function useEstreito(): boolean {
  const consulta = () => typeof window.matchMedia === "function" && window.matchMedia(ESTREITO).matches;
  const [estreito, setEstreito] = useState(consulta);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(ESTREITO);
    const ouvir = () => setEstreito(mq.matches);
    mq.addEventListener("change", ouvir);
    return () => mq.removeEventListener("change", ouvir);
  }, []);
  return estreito;
}

/** Animações só fora de testes (jsdom) e sem pedido de movimento reduzido. */
function animar(escopo: HTMLElement, cena: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const ctx = gsap.context(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", cena);
  }, escopo);
  return () => {
    ctx.revert();
    escopo.classList.remove("montando");
  };
}

/** Marca de entrada: ao terminar, devolve o controle ao CSS (filtro e hover). */
const LIMPAR = "opacity,transform,translate,rotate,scale,transformOrigin";

/**
 * Mapa do corpus. No modo grande, os pontos sobem da linha de base até a
 * posição real ao abrir a página (o único movimento que não responde a um
 * gesto). No modo mini, a mira se desenha até o site em foco.
 *
 * O SVG é uma imagem com descrição; os pontos não recebem foco: a tabela ao
 * lado é o caminho pelo teclado e pelo leitor de tela.
 */
export function MapaCorpus({
  dados,
  modo,
  visiveis,
  selecionado,
  onAbrir,
}: {
  dados: DadosMapa;
  modo: "grande" | "mini";
  visiveis?: ReadonlySet<string>;
  selecionado?: string;
  onAbrir?: (id: string) => void;
}) {
  const estreito = useEstreito();
  const g = modo === "mini" ? GEOMETRIA_MINI : estreito ? GEOMETRIA_ESTREITA : GEOMETRIA_GRANDE;
  const e = escala(g);
  const lado = LADO[modo];
  const ref = useRef<HTMLElement>(null);
  const guia = useRef<SVGGElement>(null);
  const idLegenda = useId();
  const [sobre, setSobre] = useState<string | null>(null);
  const alvo = selecionado ? dados.pontos.find((p) => p.id === selecionado) : undefined;

  useLayoutEffect(() => {
    if (!ref.current) return;
    const escopo = ref.current;
    return animar(escopo, () => {
      // Sem a transição CSS de opacidade durante a montagem: ela atrasaria
      // cada quadro do GSAP. Os valores finais são explícitos (fromTo).
      escopo.classList.add("montando");
      const tl = gsap.timeline({ defaults: { ease: "expo.out" }, onComplete: () => escopo.classList.remove("montando") });
      if (modo === "grande") {
        tl.fromTo(
          ".marca",
          { y: (_i: number, el: SVGRectElement) => e.base - Number(el.dataset.cy), opacity: 0 },
          { y: 0, opacity: 1, duration: 1.1, stagger: { each: 0.0045 }, clearProps: LIMPAR },
        )
          .from(".mediana", { scaleX: 0, scaleY: 0, transformOrigin: "0% 100%", duration: 0.7, ease: "power3.inOut" }, "-=0.55")
          .from(".rotulo-mediana", { opacity: 0, duration: 0.4 }, "-=0.2");
      } else {
        tl.fromTo(".marca", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.out", clearProps: LIMPAR })
          .from(".mira-x", { scaleX: 0, transformOrigin: "0% 50%", duration: 0.6, ease: "power3.inOut" }, "-=0.1")
          .from(".mira-y", { scaleY: 0, transformOrigin: "50% 100%", duration: 0.6, ease: "power3.inOut" }, "<")
          .from(".alvo", { scale: 0, transformOrigin: "50% 50%", duration: 0.5, ease: "back.out(2.4)" }, "-=0.15");
      }
    });
    // monta uma vez por página; filtros mudam por CSS
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pSobre = sobre ? dados.pontos.find((p) => p.id === sobre) : undefined;
  const nVisiveis = visiveis ? dados.pontos.filter((p) => visiveis.has(p.id)).length : dados.pontos.length;

  return (
    <figure ref={ref} className={`mapa mapa-${modo}${estreito ? " mapa-estreito" : ""}`}>
      <svg
        viewBox={`0 0 ${g.largura} ${g.altura}`}
        role="img"
        aria-labelledby={idLegenda}
        onMouseLeave={() => {
          setSobre(null);
          guia.current?.classList.remove("ativa");
        }}
        onPointerMove={modo === "grande" ? (ev) => moverGuia(ev, guia.current, e) : undefined}
      >
        {/* faixas do Lighthouse no eixo da performance */}
        <g className="faixas" aria-hidden="true">
          <rect className="faixa-ruim" x={e.x(0)} y={e.topo} width={e.x(50) - e.x(0)} height={e.base - e.topo} />
          <rect className="faixa-media" x={e.x(50)} y={e.topo} width={e.x(90) - e.x(50)} height={e.base - e.topo} />
          <rect className="faixa-boa" x={e.x(90)} y={e.topo} width={e.x(100) - e.x(90)} height={e.base - e.topo} />
        </g>
        <g className="eixos" aria-hidden="true">
          {TICKS_X.map((t) => (
            <text key={`x${t}`} x={e.x(t)} y={e.base + (modo === "grande" ? 22 : 16)} textAnchor="middle">
              {t}
            </text>
          ))}
          {TICKS_Y.map((t) => (
            <g key={`y${t}`}>
              <line className="grade" x1={e.esquerda} x2={e.direita} y1={e.y(t)} y2={e.y(t)} />
              <text x={e.esquerda - 10} y={e.y(t) + 4} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          <text className="titulo-eixo" x={(e.esquerda + e.direita) / 2} y={g.altura - 6} textAnchor="middle">
            Nota de performance (Lighthouse)
          </text>
          <text
            className="titulo-eixo"
            transform={`translate(${modo === "grande" ? 16 : 12} ${(e.topo + e.base) / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            Índice de semântica
          </text>
        </g>
        {modo === "grande" && dados.medianaPerformance !== null && dados.medianaIndice !== null && (
          <g aria-hidden="true">
            <line className="mediana" x1={e.x(dados.medianaPerformance)} x2={e.x(dados.medianaPerformance)} y1={e.base} y2={e.topo} />
            <line className="mediana" x1={e.esquerda} x2={e.direita} y1={e.y(dados.medianaIndice)} y2={e.y(dados.medianaIndice)} />
            <text className="rotulo-mediana" x={e.x(dados.medianaPerformance) + 6} y={e.topo + 12}>
              mediana {fmtInteiro(dados.medianaPerformance)}
            </text>
            <text className="rotulo-mediana" x={e.direita - 4} y={e.y(dados.medianaIndice) - 6} textAnchor="end">
              mediana {fmtIndice(dados.medianaIndice)}
            </text>
          </g>
        )}
        <g className="marcas" aria-hidden="true">
          {dados.pontos.map((p) => {
            const cx = e.x(p.performance);
            const cy = e.y(p.indice);
            const apagado = visiveis !== undefined && !visiveis.has(p.id);
            return (
              <rect
                key={p.id}
                className={`marca${apagado ? " apagada" : ""}${p.id === selecionado ? " selecionada" : ""}`}
                data-cy={cy}
                x={cx - lado / 2}
                y={cy - lado / 2}
                width={lado}
                height={lado}
                onMouseEnter={() => setSobre(p.id)}
                onClick={onAbrir && !apagado ? () => onAbrir(p.id) : undefined}
              />
            );
          })}
        </g>
        {alvo && (
          <g aria-hidden="true">
            <line className="mira mira-x" x1={e.esquerda} x2={e.x(alvo.performance)} y1={e.y(alvo.indice)} y2={e.y(alvo.indice)} />
            <line className="mira mira-y" x1={e.x(alvo.performance)} x2={e.x(alvo.performance)} y1={e.base} y2={e.y(alvo.indice)} />
            <rect className="alvo" x={e.x(alvo.performance) - 7} y={e.y(alvo.indice) - 7} width={14} height={14} />
          </g>
        )}
        {modo === "grande" && (
          <g ref={guia} className="guia" aria-hidden="true">
            <line className="guia-v" y1={e.topo} y2={e.base} />
            <line className="guia-h" x1={e.esquerda} x2={e.direita} />
            <g className="guia-leitura-x">
              <rect x={-22} y={e.base + 6} width={44} height={20} rx={3} />
              <text y={e.base + 20} textAnchor="middle" />
            </g>
            <g className="guia-leitura-y">
              <rect x={e.esquerda - 52} y={-10} width={46} height={20} rx={3} />
              <text x={e.esquerda - 29} y={4} textAnchor="middle" />
            </g>
          </g>
        )}
        {pSobre && <Rotulo x={e.x(pSobre.performance)} y={e.y(pSobre.indice)} limite={e.direita} texto={pSobre.id} />}
      </svg>
      <figcaption id={idLegenda}>
        {modo === "grande"
          ? `${nVisiveis} de ${dados.pontos.length} sites do conjunto principal, pela nota de performance e pelo índice de semântica. As linhas tracejadas são as medianas do corpus (${fmtInteiro(dados.medianaPerformance)} e ${fmtIndice(dados.medianaIndice)}). ${dados.fora} sites ficam fora do mapa por não terem as duas medidas.`
          : alvo
            ? `${alvo.id} no corpus: performance ${fmtInteiro(alvo.performance)} e índice ${fmtIndice(alvo.indice)}, entre ${dados.pontos.length} sites.`
            : `Este site não aparece no mapa: falta a nota de performance ou o índice de semântica.`}
      </figcaption>
    </figure>
  );
}

/**
 * Mira que segue o ponteiro, com os valores nos dois eixos (como a régua do
 * DevTools). Mexe direto nos atributos do SVG, sem re-render do React.
 */
function moverGuia(ev: EventoPonteiro<SVGSVGElement>, g: SVGGElement | null, e: ReturnType<typeof escala>) {
  const svg = ev.currentTarget;
  const m = svg.getScreenCTM();
  if (!g || !m) return;
  const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
  const dentro = p.x >= e.esquerda && p.x <= e.direita && p.y >= e.topo && p.y <= e.base;
  g.classList.toggle("ativa", dentro);
  if (!dentro) return;
  const perf = ((p.x - e.esquerda) / (e.direita - e.esquerda)) * 100;
  const ind = ((e.base - p.y) / (e.base - e.topo)) * 100;
  g.querySelector(".guia-v")?.setAttribute("x1", String(p.x));
  g.querySelector(".guia-v")?.setAttribute("x2", String(p.x));
  g.querySelector(".guia-h")?.setAttribute("y1", String(p.y));
  g.querySelector(".guia-h")?.setAttribute("y2", String(p.y));
  g.querySelector(".guia-leitura-x")?.setAttribute("transform", `translate(${p.x} 0)`);
  g.querySelector(".guia-leitura-y")?.setAttribute("transform", `translate(0 ${p.y})`);
  const tx = g.querySelector(".guia-leitura-x text");
  const ty = g.querySelector(".guia-leitura-y text");
  if (tx) tx.textContent = fmtInteiro(perf);
  if (ty) ty.textContent = fmtIndice(ind);
}

function Rotulo({ x, y, limite, texto }: { x: number; y: number; limite: number; texto: string }) {
  const largura = texto.length * 7.4 + 16;
  const esquerda = x + 10 + largura > limite ? x - 10 - largura : x + 10;
  return (
    <g className="rotulo" aria-hidden="true">
      <rect x={esquerda} y={y - 26} width={largura} height={22} rx={3} />
      <text x={esquerda + 8} y={y - 11}>
        {texto}
      </text>
    </g>
  );
}
