import { type FormEvent, useState } from "react";

import { api } from "../api";
import { TituloDaTela, useCarga } from "../componentes/comum";
import { fmtUsd } from "../lib/formato";
import { link } from "../lib/rotas";

/** Formulário de uma análise avulsa: o servidor valida a URL, o DNS e o saldo da LLM (ADR 017). */
export function NovaAnalise({ navegar }: { navegar: (hash: string) => void }) {
  const [url, setUrl] = useState("");
  const [llm, setLlm] = useState(false);
  const [vnu, setVnu] = useState(false);
  const [envio, setEnvio] = useState<{ enviando: boolean; erro: string | null }>({ enviando: false, erro: null });
  const [saldo] = useCarga(api.llm, "llm");
  const semSaldo = saldo.estado === "ok" && saldo.dados.saldoUsd <= 0;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (url.trim() === "") {
      setEnvio({ enviando: false, erro: "Informe o endereço do site." });
      return;
    }
    setEnvio({ enviando: true, erro: null });
    try {
      const r = await api.analisar(url.trim(), { llm, vnu });
      navegar(link({ tela: "analise", id: r.id }));
    } catch (err) {
      setEnvio({ enviando: false, erro: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <>
      <TituloDaTela titulo="Nova análise">Nova análise</TituloDaTela>
      <p className="introducao">
        Roda triagem, coleta, análise e recomendação para a página inicial de um site, com as mesmas regras do TCC: User-Agent identificado,
        respeito ao <code>robots.txt</code>, só a página inicial pública. O resultado fica em <code>data/avulsos/</code>, fora do dataset do TCC.
        Leva cerca de 1 a 2 minutos; uma análise por vez.
      </p>
      <form className="formulario" onSubmit={enviar} noValidate>
        <div className="campo">
          <label htmlFor="url">Endereço do site</label>
          <input
            id="url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="ppgsw.ufrn.br"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-describedby={`url-ajuda${envio.erro ? " url-erro" : ""}`}
            aria-invalid={envio.erro ? true : undefined}
          />
          <p id="url-ajuda" className="ajuda">
            Domínio público, com ou sem https://. Endereços internos (IP privado, localhost) são recusados.
          </p>
          {envio.erro && (
            <p id="url-erro" role="alert" className="erro-campo">
              {envio.erro}
            </p>
          )}
        </div>
        <fieldset>
          <legend>Opções</legend>
          <div className="campo-caixa">
            <input
              id="op-llm"
              type="checkbox"
              checked={llm}
              disabled={semSaldo}
              onChange={(e) => setLlm(e.target.checked)}
              aria-describedby="op-llm-ajuda"
            />
            <label htmlFor="op-llm">Propor landmarks com LLM</label>
          </div>
          <p id="op-llm-ajuda" className="ajuda">
            {saldo.estado === "ok"
              ? `Saldo do teto de gasto: ${fmtUsd(saldo.dados.saldoUsd)} de ${fmtUsd(saldo.dados.tetoUsd)} (ADR 016).`
              : saldo.estado === "erro"
                ? "Não foi possível ler o saldo da LLM."
                : "Lendo o saldo da LLM…"}
            {semSaldo && " Sem saldo: a opção está desativada."}
          </p>
          <div className="campo-caixa">
            <input id="op-vnu" type="checkbox" checked={vnu} onChange={(e) => setVnu(e.target.checked)} aria-describedby="op-vnu-ajuda" />
            <label htmlFor="op-vnu">Validar com o vnu</label>
          </div>
          <p id="op-vnu-ajuda" className="ajuda">
            Exige Java instalado.
          </p>
        </fieldset>
        <button type="submit" className="botao" disabled={envio.enviando}>
          {envio.enviando ? "Enviando…" : "Analisar"}
        </button>
      </form>
    </>
  );
}
