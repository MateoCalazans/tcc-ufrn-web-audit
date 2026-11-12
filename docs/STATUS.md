# Status do projeto

> Atualizado ao fim de cada sessão (o `/fim-de-sessao` faz isso).

**Última atualização:** 2026-11-12
**Fase atual:** 4 — Recomendação (S14); diagnóstico da S13 concluído
**Próxima sessão:** S14

| Sessão | Situação | Data | Diário | Commits/tag |
|---|---|---|---|---|
| S00 | ✅ | 2026-10-19 | [s00](diario/2026-10-19-s00.md) | (a commitar) |
| S01 | ✅ | 2026-10-19 | [s01](diario/2026-10-19-s01.md) | (a commitar) |
| S02 | ✅ | 2026-10-20 | [s02](diario/2026-10-20-s02.md) | (a commitar) |
| S03 | ✅ | 2026-10-20 | [s03](diario/2026-10-20-s03.md) | (a commitar) |
| S04 | ✅ | 2026-11-04 / 11-09 | [s04](diario/2026-11-04-s04.md) | (a commitar) · v0.1-triagem |
| S05 | ✅ | 2026-11-09 | [s05](diario/2026-11-09-s05.md) | cf5a554 9b106c8 |
| S06 | ✅ | 2026-11-09 | [s06](diario/2026-11-09-s06.md) | 2a9eda5 854148c |
| S07 | ✅ | 2026-11-09 | [s07](diario/2026-11-09-s07.md) | f2677fe db15943 |
| S08 | ✅ | 2026-11-09 / 11-10 | [s08](diario/2026-11-10-s08.md) | 1e9e659 91cbfc5 78a1f86 f85a63d 01b9829 · coleta congelada (sem tag) |
| S09 | ✅ | 2026-11-10 | [s09](diario/2026-11-10-s09.md) | bc8350f 682cecd |
| S10 | ✅ | 2026-11-10 | [s10](diario/2026-11-10-s10.md) | cd869e6 8af959c 0818cac |
| S11 | ✅ | 2026-11-10 / 11-11 | [s11](diario/2026-11-11-s11.md) | d34033b 6a4af1a 239c8bd |
| S12 | ✅ | 2026-11-11 | [s12](diario/2026-11-11-s12.md) | 18ad216 870aa71 ffb7132 f44cf53 · v0.2-analise |
| S13 | ✅ | 2026-11-12 | [s13](diario/2026-11-12-s13.md) | 0beff4c cb16291 a4dbc32 39eafb5 |
| S14 | ⬜ | | | |
| S15 | ⬜ | | | |
| S16 | ⬜ | | | v0.3-recomendacao |
| S17 | ⬜ | | | |
| S18 | ⬜ | | | v1.0 |
| S19 | ⬜ | | | |

Legenda: ⬜ pendente · 🟨 em andamento · ✅ concluída · ✂️ cortada (ver ADR)

## Pendências para o orientador
- `data/interim/` não está no `.gitignore` e `normalized.csv` já foi commitado na S02 (contradiz o diário da S02). Decidir: versionar o interim de propósito ou ignorá-lo. (ver diário S03)
- Confirmar o contato definitivo do User-Agent (`CONTACT_EMAIL`); hoje está com o gmail do autor no `.env` local.
- Avaliar se `timeout` deve distinguir "conexão recusada" / "redirect-loop" como código próprio no ADR 002 (hoje só a coluna `detalhe` distingue).
- **(S04)** Validar o [ADR 005](decisoes/005-acessibilidade-na-triagem.md) (proposto): certificado TLS inválido incluído com `tls_invalido` (52 dos 242 incluídos) e triagem oficial feita de fora da UFRN (380 hosts não aceitam conexão dessa rede).
- **(S04)** Revisão manual da classificação não feita, por decisão do autor: a taxa de acerto não foi medida (ameaça à validade, ADR 005). Placeholders ("Site em Construção", "Página de Teste"…) ficaram no corpus.
- **(S04)** 37 sites `*.ct.ufrn.br` redirecionam para `api-boreas.ct.ufrn.br`, que não existe no DNS. Avisar a unidade? Criar código de exclusão próprio?
- **(S04)** Pedir à STI/SINFO a liberação do nosso User-Agent (servidores que derrubam a conexão ou respondem 403, como `acervo.ufrn.br`).
- **(S05)** Validar o [ADR 006](decisoes/006-parametros-da-coleta-renderizada.md) (proposto): parâmetros da coleta renderizada.
- **(S05/S08/S09)** `pingifes.ufrn.br` (login) e `comunica.ufrn.br` (`NOT_HTML`) excluídos na análise com motivo: registrado no [ADR 009](decisoes/009-metricas-de-performance-na-analise.md) (proposto, validar).
- **(S10)** 23 incluídos usam meta refresh (bruto ≠ renderizado). O Lighthouse segue o redirecionamento e mede a página de destino (S06, `acervus`). Na S10 (ADR 010) viraram as flags `metaRefresh`/`renderedComRefresh`: em **10** sites (9 no conjunto principal) o `rendered.html` é o stub. O tratamento (manter, separar, excluir) fica para a S12/S13.
- **(S10)** Validar o [ADR 010](decisoes/010-indicadores-semanticos-parte-1.md) (proposto): definições de div+span, landmarks (HTML-AAM) e títulos. Detalhes acrescentados sem consulta: `svg`/`math`, `noscript` na flag, primeiro título não comparado, status `vazio`.
- **(S10)** `enterpriseenrollment.ufrn.br` (tela de login da Microsoft/Intune) excluído da análise com motivo `login` (regra 4), por decisão do autor: adendo ao ADR 009. Conjunto principal: **217** sites (era 218).
- **(S10)** 4 páginas idênticas "Página de Teste de Hospedagem Web" da STI (`eject.ect`, `farmacia.ccs`, `gmag.fisica`, `histed.ce`) com `body` vazio: sem indicadores semânticos, mas no conjunto principal de performance. Decidir na S12.
- **(S11)** Validar o [ADR 011](decisoes/011-indicadores-semanticos-parte-2.md) (proposto): heurística de tabela de layout (não validada em amostra), `alt=""` válido, `placeholder`/`title` não aceitos como rótulo (103 de 145 campos sem rótulo têm só isso) e 6 detalhes acrescentados sem consulta.
- **(S11)** vnu executado (JDK 24 via `JAVA_HOME`, `vnu-jar` 26.10.12) sobre o `rendered.html`, o DOM serializado, e não o HTML de origem: 205 de 213 sites com erro, mediana 16. Basta validar o DOM ou validar também o `raw.html`?
- **(S11)** O diretório `c:\` minúsculo quebra o vitest no Windows (25 arquivos falham); com `C:\` passa. Registrar como cuidado de reprodutibilidade?
- **(S11)** Conferir as referências do ADR 011 citadas de memória (WCAG H67, F46, H51; eMAG 3.1, 3.6, 6.2).
- **(S12)** Validar o [ADR 003](decisoes/003-indice-de-semantica.md) (proposto): pesos 20/20/15/15/10/10/5/5 e pontos de corte. A WebAIM #10 sustenta o peso dos títulos (71,6% começam por eles), mas não o dos landmarks (3,7%). Sensibilidade: ρ = 0,984 entre os rankings. Detalhes sem consulta: saltos / (`total` − 1), interativos N/A sem `onclick`, layout declarada penalizada.
- **(S12)** Subnotas pouco informativas: campos (mediana 0), interativos (só 5 sites, todos 0), metadados e obsoletos (quase constantes). Manter as 8 ou simplificar?
- **(S12)** Validar o [ADR 012](decisoes/012-dataset-e-tratamentos.md) (proposto): `metrics.json` fora do `data/raw/`; os 9 stubs de meta refresh e os 6 `vazio` ficam no dataset, com flags (resolve as pendências S10 de meta refresh e das páginas de teste da STI quanto ao dataset; a análise com e sem eles fica para a S13).
- **(S12)** Reprodutibilidade: `gitDirty` conta arquivos fora do git (apagar as saídas antes de regenerar); o git converte LF para CRLF no checkout do Windows, o que muda o SHA-256 do `dataset.csv`. Criar `.gitattributes`?

- **(S06)** Validar o [ADR 007](decisoes/007-parametros-do-lighthouse.md) (proposto): parâmetros do Lighthouse.
- **(S06)** Variabilidade do Lighthouse no piloto: amplitude da nota de performance de até 32 pontos (mediana 8). Manter 3 execuções (regra 6) ou subir para 5?
- **(S07)** Validar o [ADR 008](decisoes/008-coleta-retomavel-sem-nova-tentativa.md) (proposto): coleta retomável, sites com falha não são tentados de novo.
- **(S08)** `Ctrl+C` testado no Windows: não para de forma limpa (o processo morre na hora, código 1), mas equivale a uma queda e não corrompe os dados (adendo ao ADR 008).
- **(S09)** Validar o [ADR 009](decisoes/009-metricas-de-performance-na-analise.md) (proposto): métricas da execução mediana pela nota (132 de 225 divergem do `computeMedianRun`, que vira coluna de sensibilidade); falha = `score < 0.9` fora dos grupos `metrics`/`hidden`; 6 sites `parcial` (1 execução válida) fora do conjunto principal (218 sites).
- **(S09)** Nenhum objetivo específico da rastreabilidade cobre as métricas de performance (OE3 é só semântica): criar OE ou ampliar o OE3?

- **(S08)** Validar o adendo ao [ADR 008](decisoes/008-coleta-retomavel-sem-nova-tentativa.md): coleta em 2 execuções (queda por memória no site 87, retomada com heap de 8 GB, 56 min de pausa).
- **(S08)** 25 sites com falha (10,3%): 13 `NO_FCP`, 6 `NO_NAVSTART`, 2 `bruto:AbortError`, 2 `ERRORED_DOCUMENT_REQUEST`, 1 `NOT_HTML`, 1 `sem-nota`. Olhar os `NO_FCP`/`NO_NAVSTART` na análise.
- **(S08)** Variação do Lighthouse no corpus: mediana da amplitude de 2, máxima de 35, 27 sites com ≥ 10 pontos (ameaça à validade; a coleta está congelada).
- **(S08)** Aviso à STI/SINFO não enviado, por decisão do autor (desvio do roteiro).
- **(S08)** Guardar cópia do `data/raw-coleta-2026-11-09.zip` (1,07 GB, SHA-256 em `docs/ambiente/hashes.md`) fora deste PC. Decidir sobre a tag de congelamento.

- **(S13)** Validar o [ADR 013](decisoes/013-plano-de-analise-estatistica.md) (proposto): Holm por família, limiar de 10 sites por grupo de tecnologia (`outro` = joomla + outro-cms, 11 sites), análise com e sem os stubs. Correlações com n < 10 ou variável constante ficam fora do Holm (acrescentado ao ADR depois da S13; só `sub_interativos`, n = 5).
- **(S13)** Circularidade semântica × acessibilidade (ρ = 0,47): conferir na documentação do Lighthouse quais auditorias de acessibilidade se sobrepõem às subnotas do índice. Referências estatísticas do ADR 013 citadas de memória.
- **(S13)** `reports/index.html` (panorama) fora do git: versionar? (Resolvido depois da S13: `analysis/requirements.txt` criado e notebook reexecutado com o `meta.json` apontando para o commit que já tem o notebook.)
- **(S13)** Cronograma cerca de 1,5 semana atrás do recalibrado: discutir a ordem de cortes.

## Bloqueios
-
