import { type ReactNode, useMemo } from "react";

import { ROTULO_TECNOLOGIA, ROTULO_TIPO, fmtData, rotulo } from "../lib/formato";
import type { Captura, Metricas, Recomendacoes as DadosRecomendacoes, ResumoValidacao, Trecho } from "../tipos";
import { BarraSecoes, type Secao } from "./BarraSecoes";
import { Capturas } from "./Capturas";
import { Indicadores } from "./Indicadores";
import { Notas } from "./Notas";
import { Recomendacoes } from "./Recomendacoes";
import { Validacao } from "./Validacao";

export interface DadosPainel {
  site: string;
  metrics: Metricas | null;
  recomendacoes: DadosRecomendacoes | null;
  trechos: Record<string, Trecho>;
  fixDiff: string | null;
  origemRecomendacoes: string;
  screenshot: string | null;
  capturas?: Captura[];
  siteCorpus: boolean;
  avisos?: string[];
  /** Validação do módulo 4, quando há (só no corpus). */
  validacoes?: ResumoValidacao[];
  /** Ao lado da ficha (o mapa com o site em foco). */
  aoLado?: ReactNode;
}

/** Painel de um site: o mesmo para o corpus do TCC e para uma análise avulsa. */
export function Painel(d: DadosPainel) {
  const m = d.metrics;
  const nRecs = d.recomendacoes?.recommendations?.length;
  const temValidacao = (d.validacoes?.length ?? 0) > 0;
  const secoes = useMemo<Secao[]>(
    () => [
      ...(m ? [{ id: "titulo-notas", rotulo: "Notas" }] : []),
      ...(d.recomendacoes ? [{ id: "titulo-recomendacoes", rotulo: "Recomendações", contagem: nRecs ?? 0 }] : []),
      ...(temValidacao ? [{ id: "titulo-validacao", rotulo: "Validação" }] : []),
      { id: "titulo-capturas", rotulo: "Screenshots" },
      ...(m ? [{ id: "titulo-indicadores", rotulo: "Indicadores" }] : []),
    ],
    [m, d.recomendacoes, nRecs, temValidacao],
  );
  return (
    <>
      <div className={d.aoLado ? "cabeca-site com-mapa" : "cabeca-site"}>
      {m && (
        <dl className="ficha">
          <div>
            <dt>Endereço</dt>
            <dd>{m.url}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>{rotulo(ROTULO_TIPO, m.contexto?.tipo)}</dd>
          </div>
          <div>
            <dt>Tecnologia</dt>
            <dd>{rotulo(ROTULO_TECNOLOGIA, m.contexto?.tecnologia)}</dd>
          </div>
          <div>
            <dt>Métricas geradas em</dt>
            <dd>
              {fmtData(m.meta?.generatedAt)}
              {m.meta?.gitCommit ? ` (commit ${m.meta.gitCommit.slice(0, 7)})` : ""}
            </dd>
          </div>
        </dl>
      )}
      {d.aoLado}
      </div>
      {(d.avisos ?? []).map((a) => (
        <p key={a} className="aviso">
          {a}
        </p>
      ))}
      <BarraSecoes secoes={secoes} />
      {m ? <Notas m={m} /> : <p className="aviso">Sem métricas para este site.</p>}
      {d.recomendacoes ? (
        <Recomendacoes dados={d.recomendacoes} trechos={d.trechos} fixDiff={d.fixDiff} origem={d.origemRecomendacoes} />
      ) : null}
      {temValidacao && <Validacao site={d.site} versoes={d.validacoes!} />}
      <Capturas site={d.site} screenshot={d.screenshot} capturas={d.capturas} siteCorpus={d.siteCorpus} />
      {m && <Indicadores m={m} />}
    </>
  );
}
