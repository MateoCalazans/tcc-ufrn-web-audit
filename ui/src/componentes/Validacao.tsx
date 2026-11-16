import { useState } from "react";

import { urls } from "../api";

import { fmtData, fmtInteiro } from "../lib/formato";
import { GRUPOS_VALIDACAO, ROTULO_EFEITO, contarEfeitos, dentroDaVariacao, efeito } from "../lib/validacao";
import type { ResumoValidacao } from "../tipos";

const ROTULO_VERSAO: Record<ResumoValidacao["versao"], string> = {
  "v1.0": "v1.0, resultado principal",
  "mais-recente": "Rodada mais recente",
};

function faixaVariacao(v: ResumoValidacao["variacao"]["original"]): string {
  if (!v || v.min === null || v.max === null) return "sem dado";
  return v.min === v.max ? `${fmtInteiro(v.min)} nas ${v.n}` : `de ${fmtInteiro(v.min)} a ${fmtInteiro(v.max)} nas ${v.n}`;
}

function Tabela({ v }: { v: ResumoValidacao }) {
  return (
    <div className="tabela-rolagem" tabIndex={0} role="region" aria-labelledby="titulo-tabela-validacao">
      <table className="tabela-validacao">
        <caption id="titulo-tabela-validacao">Antes e depois da correção, na mediana das execuções</caption>
        <thead>
          <tr>
            <th scope="col">Métrica</th>
            <th scope="col" className="num">
              Original
            </th>
            <th scope="col" className="num">
              Corrigida
            </th>
            <th scope="col" className="num">
              Diferença
            </th>
            <th scope="col">Efeito</th>
          </tr>
        </thead>
        {GRUPOS_VALIDACAO.map((g) => (
          <tbody key={g.titulo}>
            <tr className="linha-grupo">
              <th scope="colgroup" colSpan={5}>
                {g.titulo}
              </th>
            </tr>
            {g.linhas.map((l) => {
              const c = v.deltas[l.chave];
              const ef = efeito(c, l.sentido);
              return (
                <tr key={l.chave}>
                  <th scope="row">{l.rotulo}</th>
                  <td className="num">{l.fmt(c?.original ?? null)}</td>
                  <td className="num">{l.fmt(c?.corrigido ?? null)}</td>
                  <td className="num">{c && c.delta !== null ? l.fmtDelta(c.delta) : "—"}</td>
                  <td>
                    <span className={`efeito efeito-${ef}`}>{ROTULO_EFEITO[ef]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/**
 * Validação do módulo 4: cópia local original × cópia local corrigida, no
 * mesmo servidor e com o mesmo throttling (regra 7). Nunca o site ao vivo.
 */
export function Validacao({ site, versoes }: { site: string; versoes: ResumoValidacao[] }) {
  const [escolhida, setEscolhida] = useState(0);
  const v = versoes[Math.min(escolhida, versoes.length - 1)];
  if (!v) return null;
  const n = contarEfeitos(v);
  const dentro = dentroDaVariacao(v);
  return (
    <section aria-labelledby="titulo-validacao">
      <h2 id="titulo-validacao">Validação</h2>
      <p className="introducao-secao">
        O Lighthouse mediu a cópia local da página antes e depois das correções automáticas, no mesmo servidor e com as mesmas condições. É
        uma comparação entre cópias, não com o site ao vivo.
      </p>
      {versoes.length > 1 && (
        <div className="versoes" role="group" aria-label="Rodada da validação">
          {versoes.map((x, i) => (
            <button key={x.versao} type="button" aria-pressed={i === escolhida} onClick={() => setEscolhida(i)}>
              {ROTULO_VERSAO[x.versao]}
            </button>
          ))}
        </div>
      )}
      <p className="legenda">
        {ROTULO_VERSAO[v.versao]}: medida em {fmtData(v.generatedAt ?? undefined)}
        {v.gitCommit ? ` (commit ${v.gitCommit.slice(0, 7)}${v.gitDirty ? ", com alterações não commitadas" : ""})` : ""}, no arquivo{" "}
        <code>{v.arquivo}</code>. {v.parametros.execucoesPorVariante ?? "?"} execuções por variante, perfil {v.parametros.formFactor ?? "?"}.
        Válidas: {v.execucoesValidas.original} na original e {v.execucoesValidas.corrigido} na corrigida.
      </p>
      <p className="resumo-validacao">
        <span className="efeito efeito-melhorou">{n.melhorou} melhoraram</span>
        <span className="efeito efeito-piorou">{n.piorou} pioraram</span>
        <span className="efeito efeito-igual">{n.igual} iguais</span>
        {n["sem-dado"] > 0 && <span className="efeito efeito-sem-dado">{n["sem-dado"]} sem dado</span>}
      </p>
      {dentro === true && (
        <p className="aviso-ruido">
          A nota de performance variou mais entre as execuções de uma mesma cópia ({faixaVariacao(v.variacao.original)} na original,{" "}
          {faixaVariacao(v.variacao.corrigido)} na corrigida) do que entre as duas cópias. Neste site, "melhorou" e "piorou" não se distinguem do
          ruído do Lighthouse.
        </p>
      )}
      {v.medianas.original !== null && v.medianas.corrigido !== null && (
        <div className="telas-finais">
          {(["original", "corrigido"] as const).map((variante) => (
            <figure key={`${v.versao}-${variante}`}>
              <figcaption>
                {variante === "original" ? "Antes: cópia original" : "Depois: cópia corrigida"}, execução {v.medianas[variante]}
              </figcaption>
              <img
                src={urls.telaFinal(site, variante, v.versao)}
                alt={`Primeira tela de ${site} no celular, ao fim do carregamento, na cópia ${variante === "original" ? "original" : "corrigida"}`}
                loading="lazy"
              />
            </figure>
          ))}
          <p className="legenda">Primeira tela do celular ao fim do carregamento, tirada pelo próprio Lighthouse na execução mediana. Não é a página inteira.</p>
        </div>
      )}
      <Tabela v={v} />
      <p className="legenda">
        Nota de performance nas execuções: {faixaVariacao(v.variacao.original)} da original e {faixaVariacao(v.variacao.corrigido)} da corrigida.
        {dentro === false && " A diferença na nota de performance passa dessa variação."} Um site só não basta para concluir: o teste é feito na
        amostra inteira (ADR 004).
      </p>
    </section>
  );
}
