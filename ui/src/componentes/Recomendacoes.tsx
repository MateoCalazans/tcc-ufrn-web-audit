import gsap from "gsap";
import { type ReactNode, type SyntheticEvent, useMemo, useRef, useState } from "react";

import {
  REFERENCIA_REGRA,
  ROTULO_DIMENSAO,
  ROTULO_SEVERIDADE,
  agruparPorRegra,
  agruparPorSeveridade,
  diferencaLadoALado,
  linhasDoDiff,
  resumoMensagem,
  type Segmento,
} from "../lib/recomendacoes";
import type { Recomendacoes as DadosRecomendacoes, Recomendacao, Trecho } from "../tipos";
import { Codigo } from "./comum";

function Segmentos({ segs }: { segs: Segmento[] }) {
  return (
    <>
      {segs.map((s, i) =>
        s.tipo === "removido" ? (
          <del key={i}>{s.texto}</del>
        ) : s.tipo === "inserido" ? (
          <ins key={i}>{s.texto}</ins>
        ) : (
          <span key={i}>{s.texto}</span>
        ),
      )}
    </>
  );
}

/** Trecho original e corrigido, lado a lado; o que mudou aparece marcado com <del>/<ins>. */
export function DiffLadoALado({ id, trecho }: { id: string; trecho: Trecho }) {
  const d = diferencaLadoALado(trecho.antes, trecho.depois);
  const reticencias = (t: Segmento[]) => [
    ...(trecho.cortadoInicio ? [{ texto: "…", tipo: "igual" as const }] : []),
    ...t,
    ...(trecho.cortadoFim ? [{ texto: "…", tipo: "igual" as const }] : []),
  ];
  return (
    <div className="diff-lados">
      <figure>
        <figcaption>Antes, em index.html (linha {trecho.linha})</figcaption>
        <Codigo rotulo={`Trecho original de ${id}`}>
          <Segmentos segs={reticencias(d.antes)} />
        </Codigo>
      </figure>
      <figure>
        <figcaption>Depois, em fixed.html</figcaption>
        <Codigo rotulo={`Trecho corrigido de ${id}`}>
          <Segmentos segs={reticencias(d.depois)} />
        </Codigo>
      </figure>
    </div>
  );
}

/**
 * <details> que desliza ao abrir (GSAP). Fechar é imediato. O conteúdo só é
 * montado depois da primeira abertura: com dezenas de diffs, a página não
 * paga por eles até alguém pedir.
 */
function Dobra({
  resumo,
  children,
  classe,
  aberta,
  aoMudar,
}: {
  resumo: ReactNode;
  children: ReactNode;
  classe: string;
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
}) {
  const corpo = useRef<HTMLDivElement>(null);
  const [montado, setMontado] = useState(aberta);
  function alternar(e: SyntheticEvent<HTMLDetailsElement>) {
    const abriu = e.currentTarget.open;
    if (abriu !== aberta) aoMudar(abriu);
    if (!abriu) return;
    setMontado(true);
    if (typeof requestAnimationFrame !== "function") return;
    requestAnimationFrame(() => {
      const el = corpo.current;
      if (!el || typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.fromTo(el, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.32, ease: "power2.out", clearProps: "height,opacity" });
    });
  }
  return (
    <details className={classe} open={aberta} onToggle={alternar}>
      <summary>{resumo}</summary>
      <div ref={corpo} className="dobra-corpo">
        {(montado || aberta) && children}
      </div>
    </details>
  );
}

function Ocorrencia({
  r,
  trecho,
  aberta,
  aoMudar,
}: {
  r: Recomendacao;
  trecho: Trecho | undefined;
  aberta: boolean;
  aoMudar: (a: boolean) => void;
}) {
  return (
    <li>
      <Dobra
        classe="ocorrencia"
        aberta={aberta}
        aoMudar={aoMudar}
        resumo={
          <>
            <span className="ocorrencia-onde">{r.posicao ? `linha ${r.posicao.linha}` : "sem posição"}</span>
            <span className="ocorrencia-resumo">{resumoMensagem(r.mensagem)}</span>
            {r.correcaoAutomatica && <span className="etiqueta etiqueta-ok">corrigida</span>}
          </>
        }
      >
        <article aria-label={`${r.regra}, ${r.posicao ? `linha ${r.posicao.linha}` : "sem posição"}`} className="ocorrencia-detalhe">
          <dl className="detalhes">
            <dt>Motivo</dt>
            <dd>{r.mensagem}</dd>
            <dt>Evidência</dt>
            <dd>
              <Codigo rotulo={`Evidência de ${r.id}`}>{r.evidencia}</Codigo>
              {r.posicao ? `index.html, linha ${r.posicao.linha}, coluna ${r.posicao.coluna}` : "trecho inferido pelo parser (sem posição no arquivo)"}
            </dd>
          </dl>
          {trecho && <DiffLadoALado id={r.id} trecho={trecho} />}
        </article>
      </Dobra>
    </li>
  );
}

export function Recomendacoes({
  dados,
  trechos,
  fixDiff,
  origem,
}: {
  dados: DadosRecomendacoes;
  trechos: Record<string, Trecho>;
  fixDiff: string | null;
  origem: string;
}) {
  const recs = dados.recommendations ?? [];
  const [soCorrigidas, setSoCorrigidas] = useState(false);
  // abertas: regras ("regra:<id>") e ocorrências ("rec:<id>")
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set());
  const visiveis = useMemo(() => (soCorrigidas ? recs.filter((r) => r.correcaoAutomatica) : recs), [recs, soCorrigidas]);
  const grupos = agruparPorSeveridade(visiveis);
  const descricoes = new Map((dados.regras ?? []).map((r) => [r.id, r.descricao]));
  const corrigidas = recs.filter((r) => r.correcaoAutomatica).length;

  const mudar = (chave: string) => (aberta: boolean) =>
    setAbertas((a) => {
      const n = new Set(a);
      if (aberta) n.add(chave);
      else n.delete(chave);
      return n;
    });
  const abrirTodas = () => setAbertas(new Set(visiveis.flatMap((r) => [`regra:${r.regra}`, `rec:${r.id}`])));

  return (
    <section aria-labelledby="titulo-recomendacoes">
      <h2 id="titulo-recomendacoes">Recomendações</h2>
      <p className="legenda">
        {recs.length} recomendações, {corrigidas} com correção automática, {origem}
        {dados.llm?.modelo ? `; landmarks propostos por LLM (${dados.llm.prompt ?? "?"}, ${dados.llm.modelo}).` : "; sem LLM."}
      </p>
      {recs.length === 0 ? (
        <p className="aviso">Nenhuma regra encontrou problema nesta página.</p>
      ) : (
        <div className="controles-recomendacoes">
          <div className="campo-caixa">
            <input id="so-corrigidas" type="checkbox" checked={soCorrigidas} onChange={(e) => setSoCorrigidas(e.target.checked)} />
            <label htmlFor="so-corrigidas">Só com correção automática</label>
          </div>
          <button type="button" className="botao-secundario botao-pequeno" onClick={abrirTodas}>
            Abrir todas
          </button>
          <button type="button" className="botao-secundario botao-pequeno" onClick={() => setAbertas(new Set())} disabled={abertas.size === 0}>
            Fechar todas
          </button>
        </div>
      )}
      {recs.length > 0 && visiveis.length === 0 && <p className="aviso">Nenhuma recomendação com correção automática nesta página.</p>}
      {grupos.map((g) => (
        <section key={g.severidade} aria-labelledby={`sev-${g.severidade}`} className={`grupo sev-${g.severidade}`}>
          <h3 id={`sev-${g.severidade}`}>
            Severidade {ROTULO_SEVERIDADE[g.severidade].toLowerCase()} <span className="contagem">({g.itens.length})</span>
          </h3>
          <ul className="lista-regras">
            {agruparPorRegra(g.itens).map((gr) => {
              const ref = REFERENCIA_REGRA[gr.regra];
              const chave = `regra:${gr.regra}`;
              return (
                <li key={gr.regra}>
                  <Dobra
                    classe="regra"
                    aberta={abertas.has(chave)}
                    aoMudar={mudar(chave)}
                    resumo={
                      <>
                        <code className="regra-nome">{gr.regra}</code>
                        <span className="regra-contagem">
                          {gr.itens.length === 1 ? "1 ocorrência" : `${gr.itens.length} ocorrências`}
                          {gr.corrigidas > 0 ? `, ${gr.corrigidas} ${gr.corrigidas === 1 ? "corrigida" : "corrigidas"} automaticamente` : ", sem correção automática"}
                        </span>
                        <span className="etiqueta">{ROTULO_DIMENSAO[gr.dimensao]}</span>
                      </>
                    }
                  >
                    {descricoes.get(gr.regra) && <p className="regra-descricao">{descricoes.get(gr.regra)}</p>}
                    <p className="regra-referencia">Referência: {ref ? `${ref.adr}, em ${ref.arquivo}` : "sem referência registrada"}</p>
                    <ul className="lista-ocorrencias">
                      {gr.itens.map((r) => (
                        <Ocorrencia key={r.id} r={r} trecho={trechos[r.id]} aberta={abertas.has(`rec:${r.id}`)} aoMudar={mudar(`rec:${r.id}`)} />
                      ))}
                    </ul>
                  </Dobra>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {fixDiff && (
        <details className="diff-completo">
          <summary>Ver o fix.diff completo ({linhasDoDiff(fixDiff).length} linhas)</summary>
          <Codigo rotulo="fix.diff completo">
            {linhasDoDiff(fixDiff).map((l, i) => (
              <span key={i} className={`linha-${l.tipo}`}>
                {l.texto}
                {"\n"}
              </span>
            ))}
          </Codigo>
        </details>
      )}
    </section>
  );
}
