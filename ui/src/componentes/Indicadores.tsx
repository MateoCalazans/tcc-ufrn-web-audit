import { VAZIO, fmtBytes, fmtCls, fmtData, fmtIndice, fmtInteiro, fmtMs, fmtProporcao } from "../lib/formato";
import type { Metricas } from "../tipos";

/** Pesos do ADR 003 (`PESOS_PROPOSTOS` em `src/analyze/indice.ts`; um teste confere). */
export const SUBNOTAS = [
  ["landmarks", "Landmarks", 20],
  ["titulos", "Títulos", 20],
  ["imagens", "Imagens (alt)", 15],
  ["campos", "Campos de formulário (rótulo)", 15],
  ["divSpan", "Proporção de div e span", 10],
  ["metadados", "Metadados (lang, title, viewport, description)", 10],
  ["interativos", "Elementos interativos falsos", 5],
  ["obsoletos", "Elementos obsoletos", 5],
] as const;

const simNao = (v: boolean | undefined) => (v === undefined ? VAZIO : v ? "sim" : "não");

function Tabela({ id, titulo, linhas }: { id: string; titulo: string; linhas: Array<[string, string]> }) {
  return (
    <table className="tabela-indicadores" aria-labelledby={id}>
      <caption id={id}>{titulo}</caption>
      <thead>
        <tr>
          <th scope="col">Indicador</th>
          <th scope="col">Valor</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Indicadores brutos (regra 9): a banca pode questionar os pesos, então os brutos aparecem junto. */
export function Indicadores({ m }: { m: Metricas }) {
  const p = m.performance;
  const pm = p?.metricas;
  const s = m.semantica?.indicadores;
  const sub = m.indice?.subnotas ?? {};

  const perf: Array<[string, string]> = [
    ["First Contentful Paint (FCP)", fmtMs(pm?.fcpMs)],
    ["Largest Contentful Paint (LCP)", fmtMs(pm?.lcpMs)],
    ["Total Blocking Time (TBT)", fmtMs(pm?.tbtMs)],
    ["Cumulative Layout Shift (CLS)", fmtCls(pm?.cls)],
    ["Speed Index", fmtMs(pm?.speedIndexMs)],
    ["Peso total transferido", fmtBytes(pm?.pesoTotalBytes)],
    ["Requisições", fmtInteiro(pm?.requisicoes)],
    ["JavaScript não usado", fmtBytes(pm?.jsNaoUsadoBytes)],
    ["CSS não usado", fmtBytes(pm?.cssNaoUsadoBytes)],
    ["Execuções válidas do Lighthouse", p?.execucoesValidas === undefined ? VAZIO : `${p.execucoesValidas} de 3`],
    ["Amplitude da nota nas 3 execuções", fmtInteiro(p?.amplitudePerformance)],
  ];

  const sem: Array<[string, string]> = s
    ? [
        ["div e span / elementos do body", `${fmtInteiro((s.divSpan?.div ?? 0) + (s.divSpan?.span ?? 0))} de ${fmtInteiro(s.divSpan?.total)} (${fmtProporcao(s.divSpan?.proporcao)})`],
        [
          "Landmarks (banner, navigation, main, contentinfo)",
          s.landmarks ? `${s.landmarks.banner}, ${s.landmarks.navigation}, ${s.landmarks.main}, ${s.landmarks.contentinfo}` : VAZIO,
        ],
        ["Títulos (total / h1 / saltos de nível)", s.titulos ? `${s.titulos.total} / ${s.titulos.h1} / ${s.titulos.saltos}` : VAZIO],
        ["Imagens (total / sem alt / alt vazio)", s.imagens ? `${s.imagens.total} / ${s.imagens.semAlt} / ${s.imagens.altVazio}` : VAZIO],
        ["Campos (total / sem rótulo)", s.campos ? `${s.campos.total} / ${s.campos.semLabel}` : VAZIO],
        ["Interativos falsos (div/span com onclick)", s.interativosFalsos ? `${s.interativosFalsos.falsos} de ${s.interativosFalsos.comOnclick}` : VAZIO],
        ["Elementos obsoletos (WHATWG)", fmtInteiro(s.obsoletas?.whatwg)],
        ["Tabelas (total / de layout)", s.tabelas ? `${s.tabelas.total} / ${s.tabelas.layoutDeclarada + s.tabelas.layoutHeuristica}` : VAZIO],
        ["Idioma (lang)", s.metadados?.lang ?? "ausente"],
        ["Tem title / viewport / description", `${simNao(s.metadados?.temTitle)} / ${simNao(s.metadados?.temViewport)} / ${simNao(s.metadados?.temDescription)}`],
        [
          "Validador vnu (erros / avisos)",
          m.semantica?.vnu?.status === "ok" ? `${fmtInteiro(m.semantica.vnu.erros)} / ${fmtInteiro(m.semantica.vnu.avisos)}` : "não executado",
        ],
      ]
    : [];

  return (
    <section aria-labelledby="titulo-indicadores">
      <h2 id="titulo-indicadores">Indicadores</h2>
      <p className="legenda">
        Coleta de {fmtData(p?.coleta?.collectedAt)}, no perfil mobile do Lighthouse (mediana de 3 execuções).
      </p>
      <div className="grade-tabelas">
        <Tabela id="tab-perf" titulo="Performance (Lighthouse)" linhas={perf} />
        {s ? (
          <Tabela id="tab-sem" titulo="Semântica HTML (DOM renderizado)" linhas={sem} />
        ) : (
          <p className="aviso">Sem indicadores semânticos ({m.semantica?.status ?? "não medidos"}).</p>
        )}
        <table className="tabela-indicadores" aria-labelledby="tab-sub">
          <caption id="tab-sub">Subnotas do índice de semântica</caption>
          <thead>
            <tr>
              <th scope="col">Subnota</th>
              <th scope="col">Peso</th>
              <th scope="col">Valor (0–100)</th>
            </tr>
          </thead>
          <tbody>
            {SUBNOTAS.map(([chave, rotulo, peso]) => {
              const v = sub[chave];
              return (
                <tr key={chave}>
                  <th scope="row">{rotulo}</th>
                  <td>{peso}</td>
                  <td>{v === null || v === undefined ? "não se aplica" : fmtIndice(v)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
