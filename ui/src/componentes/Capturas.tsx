import { urls } from "../api";
import type { Captura } from "../tipos";

/**
 * Screenshots. A coleta guarda a página como estava ("antes"). Uma captura
 * "depois" só existe onde a validação dos landmarks gravou as duas capturas; para os
 * outros, a tela diz que não há.
 */
export function Capturas({
  site,
  screenshot,
  capturas = [],
  siteCorpus,
}: {
  site: string;
  screenshot: string | null;
  capturas?: Captura[];
  siteCorpus: boolean;
}) {
  const temPar = capturas.includes("landmarks-original") && capturas.includes("landmarks-corrigido");
  return (
    <section aria-labelledby="titulo-capturas">
      <h2 id="titulo-capturas">Screenshots</h2>
      {temPar ? (
        <div className="capturas-par">
          <figure>
            <figcaption>Antes: cópia local original</figcaption>
            <div className="captura" tabIndex={0} role="region" aria-label="Screenshot antes da correção">
              <img src={urls.captura(site, "landmarks-original")} alt={`Página inicial de ${site}, cópia local original`} />
            </div>
          </figure>
          <figure>
            <figcaption>Depois: cópia local com os landmarks corrigidos</figcaption>
            <div className="captura" tabIndex={0} role="region" aria-label="Screenshot depois da correção">
              <img src={urls.captura(site, "landmarks-corrigido")} alt={`Página inicial de ${site}, cópia local com os landmarks corrigidos`} />
            </div>
          </figure>
        </div>
      ) : screenshot ? (
        <>
          <figure className="captura-unica">
            <figcaption>Antes: a página no dia da coleta</figcaption>
            <div className="captura" tabIndex={0} role="region" aria-label="Screenshot da coleta">
              <img src={screenshot} alt={`Página inicial de ${site} no momento da coleta`} />
            </div>
          </figure>
          <p className="legenda">
            {siteCorpus
              ? "Não há screenshot da versão corrigida deste site: o par antes × depois só existe para os sites em que a validação dos landmarks gerou as duas capturas."
              : "Análise avulsa: não há screenshot da versão corrigida (a validação antes × depois não roda na interface)."}
          </p>
        </>
      ) : (
        <p className="aviso">Sem screenshot da coleta.</p>
      )}
    </section>
  );
}
