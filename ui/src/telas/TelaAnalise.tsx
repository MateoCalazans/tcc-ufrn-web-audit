import gsap from "gsap";
import { useEffect, useRef, useState } from "react";

import { api, urls } from "../api";
import { Carregando, Codigo, Erro, TituloDaTela, useCarga } from "../componentes/comum";
import { Painel } from "../componentes/Painel";
import { fmtMs } from "../lib/formato";
import { ROTULO_ESTADO, ROTULO_SITUACAO, TERMINAIS, eventosParaMostrar, progresso } from "../lib/progresso";
import { link } from "../lib/rotas";
import type { Evento, ResumoAnalise } from "../tipos";

/** Eventos da análise por SSE; fecha quando o estado fica terminal. */
function useEventos(id: string): { eventos: Evento[]; falhaConexao: boolean } {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [falhaConexao, setFalha] = useState(false);
  useEffect(() => {
    setEventos([]);
    setFalha(false);
    let fim = false;
    const fonte = new EventSource(urls.eventos(id));
    fonte.onmessage = (m) => {
      const e = JSON.parse(m.data as string) as Evento;
      setEventos((ev) => [...ev, e]);
      if (e.tipo === "estado" && TERMINAIS.includes(e.estado)) {
        fim = true;
        fonte.close();
      }
    };
    fonte.onerror = () => {
      // O servidor fecha o fluxo ao terminar; antes disso, é queda de conexão.
      if (!fim) setFalha(true);
      fonte.close();
    };
    return () => fonte.close();
  }, [id]);
  return { eventos, falhaConexao };
}

function Resultado({ id, resumo }: { id: string; resumo: ResumoAnalise }) {
  const [carga] = useCarga(() => api.resultado(id), id);
  if (resumo.tipo === "corpus") {
    return (
      <p className="chamada">
        Recomendações prontas. <a href={link({ tela: "site", id: resumo.site })}>Abrir o painel de {resumo.site}</a>
      </p>
    );
  }
  if (carga.estado === "carregando") return <Carregando texto="Carregando o resultado…" />;
  if (carga.estado === "erro") return <Erro>Não foi possível carregar o resultado: {carga.erro}</Erro>;
  const r = carga.dados;
  return (
    <Painel
      site={resumo.site}
      metrics={r.metrics}
      recomendacoes={r.recommendations}
      trechos={r.trechos}
      fixDiff={r.fixDiff}
      origemRecomendacoes="análise avulsa"
      screenshot={r.temScreenshot ? urls.screenshotAnalise(id) : null}
      siteCorpus={false}
    />
  );
}

/**
 * Trilho ao lado das etapas: enche até a última etapa concluída. O movimento
 * responde ao avanço da análise; com movimento reduzido, só muda de altura.
 */
function Trilho({ fracao }: { fracao: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduzir = typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzir) gsap.set(el, { scaleY: fracao });
    else gsap.to(el, { scaleY: fracao, duration: 0.8, ease: "power3.out" });
  }, [fracao]);
  return (
    <span className="trilho" aria-hidden="true">
      <span ref={ref} className="trilho-cheio" />
    </span>
  );
}

/** Progresso por etapa e, ao fim, o painel do resultado. */
export function TelaAnalise({ id }: { id: string }) {
  const [resumo] = useCarga(() => api.analise(id), id);
  const { eventos, falhaConexao } = useEventos(id);
  const site = id.split("__")[0]!;

  if (resumo.estado === "carregando") return <Carregando />;
  if (resumo.estado === "erro") {
    return (
      <>
        <TituloDaTela titulo="Análise">Análise de {site}</TituloDaTela>
        <Erro>Não foi possível ler a análise: {resumo.erro}</Erro>
      </>
    );
  }

  const r = resumo.dados;
  const mostrar = eventosParaMostrar(eventos, r.eventos);
  const p = progresso(r.tipo, mostrar);
  const estado = mostrar.length > 0 ? p.estado : r.estado;
  const motivo = p.motivo ?? r.motivo ?? null;
  const terminou = TERMINAIS.includes(estado);

  return (
    <>
      <TituloDaTela titulo={`Análise de ${r.site}`}>Análise de {r.site}</TituloDaTela>
      <section aria-labelledby="titulo-progresso">
        <h2 id="titulo-progresso">Progresso</h2>
        <p role="status" className={`estado estado-${estado}`}>
          {ROTULO_ESTADO[estado]}
          {motivo ? `: ${motivo}` : ""}
        </p>
        {falhaConexao && !terminou && <Erro>A conexão com o servidor caiu. Recarregue a página para ver o estado atual.</Erro>}
        <div className="etapas-caixa">
        <Trilho fracao={p.etapas.length === 0 ? 0 : p.etapas.filter((e) => e.situacao === "concluida").length / p.etapas.length} />
        <ol className="etapas">
          {p.etapas.map((e) => (
            <li key={e.etapa} className={`etapa etapa-${e.situacao}`} aria-current={e.situacao === "rodando" ? "step" : undefined}>
              <span className="etapa-rotulo">{e.rotulo}</span>
              <span className="etapa-situacao">
                {ROTULO_SITUACAO[e.situacao]}
                {e.duracaoMs !== null ? ` em ${fmtMs(e.duracaoMs)}` : ""}
              </span>
            </li>
          ))}
        </ol>
        </div>
        {p.logs.length > 0 && (
          <details>
            <summary>Registro das etapas ({p.logs.length} linhas)</summary>
            <Codigo rotulo="Registro das etapas">{p.logs.slice(-200).join("\n")}</Codigo>
          </details>
        )}
      </section>
      {estado === "concluida" && <Resultado id={id} resumo={r} />}
    </>
  );
}
