import { useMemo, useState } from "react";

import { api } from "../api";
import { Carregando, Erro, TituloDaTela, useCarga } from "../componentes/comum";
import { MapaCorpus } from "../componentes/MapaCorpus";
import { COLUNAS, FILTRO_INICIAL, type Filtro, type Ordem, filtrar, ordenar, valores } from "../lib/corpus";
import { ROTULO_TECNOLOGIA, ROTULO_TIPO, faixaLighthouse, fmtIndice, fmtInteiro, fmtMs, numero, rotulo } from "../lib/formato";
import { dadosDoMapa } from "../lib/mapa";
import { link } from "../lib/rotas";
import type { LinhaCorpus } from "../tipos";

function Celula({ l, chave }: { l: LinhaCorpus; chave: string }) {
  const v = l[chave];
  switch (chave) {
    case "id":
      return <a href={link({ tela: "site", id: l.id })}>{l.id}</a>;
    case "tipo":
      return <>{rotulo(ROTULO_TIPO, v)}</>;
    case "tecnologia":
      return <>{rotulo(ROTULO_TECNOLOGIA, v)}</>;
    case "nota_performance":
    case "nota_accessibility": {
      const n = numero(v);
      const f = faixaLighthouse(n);
      return <span className={f ? `nota faixa-${f}` : "nota"}>{fmtInteiro(n)}</span>;
    }
    case "lcp_ms":
      return <>{fmtMs(numero(v))}</>;
    case "indice_semantica":
      return <>{fmtIndice(numero(v))}</>;
    default:
      return <>{v}</>;
  }
}

export function ListaCorpus() {
  const [carga] = useCarga(api.corpus, "corpus");
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL);
  const [ordem, setOrdem] = useState<Ordem>({ chave: "indice_semantica", direcao: "asc" });

  const linhas = carga.estado === "ok" ? carga.dados : [];
  const visiveis = useMemo(() => ordenar(filtrar(linhas, filtro), ordem), [linhas, filtro, ordem]);
  const mapa = useMemo(() => dadosDoMapa(linhas), [linhas]);
  const filtrando = filtro.texto.trim() !== "" || filtro.tipo !== "" || filtro.tecnologia !== "" || filtro.soPrincipal;
  const idsVisiveis = useMemo(() => (filtrando ? new Set(visiveis.map((l) => l.id)) : undefined), [filtrando, visiveis]);

  const mudarOrdem = (chave: Ordem["chave"]) =>
    setOrdem((o) => (o.chave === chave ? { chave, direcao: o.direcao === "asc" ? "desc" : "asc" } : { chave, direcao: "asc" }));

  return (
    <>
      <header className="abertura">
        <TituloDaTela titulo="Sites da UFRN">Sites da UFRN</TituloDaTela>
        <p className="introducao">
          {carga.estado === "ok" ? `As páginas iniciais de ${linhas.length} sites públicos da UFRN` : "As páginas iniciais dos sites públicos da UFRN"}, medidas
          em performance e em semântica HTML. Os números vêm da coleta de novembro de 2026; esta tela só lê, não coleta de novo.
        </p>
      </header>
      {carga.estado === "carregando" && <Carregando texto="Carregando o corpus…" />}
      {carga.estado === "erro" && <Erro>Não foi possível carregar o corpus: {carga.erro}</Erro>}
      {carga.estado === "ok" && (
        <>
          <MapaCorpus dados={mapa} modo="grande" visiveis={idsVisiveis} onAbrir={(id) => (window.location.hash = link({ tela: "site", id }))} />
          <form className="filtros" role="search" aria-label="Filtrar sites" onSubmit={(e) => e.preventDefault()}>
            <div className="campo">
              <label htmlFor="f-texto">Buscar pelo endereço</label>
              <input id="f-texto" type="search" value={filtro.texto} onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })} />
            </div>
            <div className="campo">
              <label htmlFor="f-tipo">Tipo</label>
              <select id="f-tipo" value={filtro.tipo} onChange={(e) => setFiltro({ ...filtro, tipo: e.target.value })}>
                <option value="">Todos</option>
                {valores(linhas, "tipo").map((v) => (
                  <option key={v} value={v}>
                    {rotulo(ROTULO_TIPO, v)}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="f-tec">Tecnologia</label>
              <select id="f-tec" value={filtro.tecnologia} onChange={(e) => setFiltro({ ...filtro, tecnologia: e.target.value })}>
                <option value="">Todas</option>
                {valores(linhas, "tecnologia").map((v) => (
                  <option key={v} value={v}>
                    {rotulo(ROTULO_TECNOLOGIA, v)}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo-caixa filtro-caixa">
              <input
                id="f-principal"
                type="checkbox"
                checked={filtro.soPrincipal}
                onChange={(e) => setFiltro({ ...filtro, soPrincipal: e.target.checked })}
              />
              <label htmlFor="f-principal">Só o conjunto principal</label>
            </div>
            <button type="button" className="botao-secundario" onClick={() => setFiltro(FILTRO_INICIAL)}>
              Limpar filtros
            </button>
          </form>
          <p role="status" className="legenda">
            {visiveis.length} de {linhas.length} sites
          </p>
          <div className="tabela-rolagem" tabIndex={0} role="region" aria-labelledby="titulo-tabela-sites">
            <table className="tabela-sites">
              <caption id="titulo-tabela-sites">
                Sites do corpus, ordenados por {COLUNAS.find((c) => c.chave === ordem.chave)!.rotulo.toLowerCase()} (
                {ordem.direcao === "asc" ? "crescente" : "decrescente"})
              </caption>
              <thead>
                <tr>
                  {COLUNAS.map((c) => (
                    <th
                      key={c.chave}
                      scope="col"
                      className={c.numerica ? "num" : undefined}
                      aria-sort={ordem.chave === c.chave ? (ordem.direcao === "asc" ? "ascending" : "descending") : undefined}
                    >
                      <button type="button" className="botao-ordem" onClick={() => mudarOrdem(c.chave)}>
                        {c.rotulo}
                        <span aria-hidden="true" className="seta">
                          {ordem.chave === c.chave ? (ordem.direcao === "asc" ? " ▲" : " ▼") : ""}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.id} className={l.conjunto_principal === "true" ? undefined : "fora-principal"}>
                    {COLUNAS.map((c) =>
                      c.chave === "id" ? (
                        <th key={c.chave} scope="row">
                          <Celula l={l} chave={c.chave} />
                          {l.conjunto_principal !== "true" && <span className="etiqueta">fora do conjunto principal</span>}
                        </th>
                      ) : (
                        <td key={c.chave} className={c.numerica ? "num" : undefined}>
                          <Celula l={l} chave={c.chave} />
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
