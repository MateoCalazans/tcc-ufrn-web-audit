import { useMemo, useState } from "react";

import { api, urls } from "../api";
import { Carregando, Erro, TituloDaTela, useCarga } from "../componentes/comum";
import { MapaCorpus } from "../componentes/MapaCorpus";
import { Painel } from "../componentes/Painel";
import { dadosDoMapa } from "../lib/mapa";
import { link } from "../lib/rotas";

/** Painel de um site do corpus do TCC (só leitura de `data/processed/`). */
export function TelaSite({ id, navegar }: { id: string; navegar: (hash: string) => void }) {
  const [carga] = useCarga(() => api.site(id), id);
  const [corpus] = useCarga(api.corpus, "corpus");
  const mapa = useMemo(() => (corpus.estado === "ok" ? dadosDoMapa(corpus.dados) : null), [corpus]);
  const [pedido, setPedido] = useState<{ enviando: boolean; erro: string | null }>({ enviando: false, erro: null });

  async function recomendar() {
    setPedido({ enviando: true, erro: null });
    try {
      const r = await api.recomendarCorpus(id);
      navegar(link({ tela: "analise", id: r.id }));
    } catch (e) {
      setPedido({ enviando: false, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <>
      <nav aria-label="Trilha" className="trilha">
        <a href={link({ tela: "lista" })}>Sites da UFRN</a> <span aria-hidden="true">›</span> <span aria-current="page">{id}</span>
      </nav>
      <TituloDaTela titulo={id}>{id}</TituloDaTela>
      {carga.estado === "carregando" && <Carregando />}
      {carga.estado === "erro" && <Erro>Não foi possível carregar o site: {carga.erro}</Erro>}
      {carga.estado === "ok" && (
        <>
          {carga.dados.recomendacao === null && !carga.dados.temBruto && (
            <p className="aviso">
              Sem recomendações: a coleta deste site não guardou o HTML bruto (<code>index.html</code>), que é a entrada das regras.
            </p>
          )}
          {carga.dados.recomendacao === null && carga.dados.temBruto && (
            <div className="chamada">
              <p>
                O TCC não gerou recomendações para este site. A interface pode rodar as regras sobre uma
                cópia do HTML bruto da coleta (sem LLM e sem nova coleta, ADR 017).
              </p>
              <button type="button" className="botao" onClick={recomendar} disabled={pedido.enviando}>
                {pedido.enviando ? "Enviando…" : "Gerar recomendações"}
              </button>
              {pedido.erro && <Erro>{pedido.erro}</Erro>}
            </div>
          )}
          <Painel
            site={id}
            metrics={carga.dados.metrics}
            recomendacoes={carga.dados.recomendacao?.recommendations ?? null}
            trechos={carga.dados.recomendacao?.trechos ?? {}}
            fixDiff={carga.dados.recomendacao?.fixDiff ?? null}
            origemRecomendacoes={
              carga.dados.recomendacao?.origem === "interface"
                ? "geradas pela interface sobre a cópia do bruto"
                : "geradas no TCC"
            }
            screenshot={carga.dados.temScreenshot ? urls.screenshotCorpus(id) : null}
            capturas={carga.dados.capturas}
            validacoes={carga.dados.validacoes}
            aoLado={mapa ? <MapaCorpus dados={mapa} modo="mini" selecionado={id} /> : undefined}
            siteCorpus
            avisos={
              carga.dados.dataset.conjunto_principal === "true"
                ? []
                : [`Fora do conjunto principal do diagnóstico: ${carga.dados.dataset.exclusao_motivo || "motivo não registrado"}.`]
            }
          />
        </>
      )}
    </>
  );
}
