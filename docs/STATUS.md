# Status do projeto

> Atualizado ao fim de cada sessão (o `/fim-de-sessao` faz isso).

**Última atualização:** 2026-11-16
**Fase atual:** 6 — Fechamento concluído (pacote de reprodutibilidade, S19); a seguir, Fase 7 (interface)
**Próxima sessão:** S20

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
| S14 | ✅ | 2026-11-12 | [s14](diario/2026-11-12-s14.md) | d609114 d64373f bb9e380 3d1d445 20e27f2 |
| S15 | ✅ | 2026-11-16 | [s15](diario/2026-11-16-s15.md) | 1ab9a18 80c0990 72953b6 5e3aa37 7389348 |
| S16 | ✅ | 2026-11-16 | [s16](diario/2026-11-16-s16.md) | e9dd3a5 d9164c9 914d1a2 042b0d7 a7e9e93 · v0.3-recomendacao |
| S17 | ✅ | 2026-11-16 | [s17](diario/2026-11-16-s17.md) | 4a40fd0 f6c2886 e0c9f47 c54f0ff |
| S18 | ✅ | 2026-11-16 | [s18](diario/2026-11-16-s18.md) | a25cb65 27a9111 4e3711b cb33eb3 f05a2e0 900d1d5 345ee72 eb3d69d · v1.0 |
| S18b | ✅ | 2026-11-16 | [s18b](diario/2026-11-16-s18b.md) | f24dfe3 a9e403d 4406460 55034ba 1cbd00f 6d89fde d8024b6 · fora do roteiro: guarda de imagens e LLM v2 |
| S19 | ✅ | 2026-11-16 | [s19](diario/2026-11-16-s19.md) | 3372e84 eb0b846 a9dd18c 422a2d2 3f39119 |
| S20 | ⬜ | | | (Fase 7, interface) |
| S21 | ⬜ | | | v1.1-interface |

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
- **(S14)** Validar o [ADR 014](decisoes/014-motor-de-regras-e-correcoes.md) (proposto): correções sobre o HTML bruto, edições nas posições de origem, `lang="pt-BR"` fixo, dimensões intrínsecas do HAR, meta viewport depois do charset. Severidades e a dimensão do achado de zoom bloqueado (`performance`) ficaram fora do ADR. Referências citadas de memória.
- **(S14)** Fins de linha: resolvido com o `.gitattributes` (`20e27f2`, `* text=auto eol=lf`). Num clone novo, as fixtures saem com LF e o SHA-256 do `dataset.csv` bate com o da S12 (resolve a pendência da S12). `registros-ufrn.txt` e a fixture `xhtml-crlf.html` ficaram com `-text`.
- **(S14)** Por que as 3 regras da S14? Vieram do `ROTEIRO.md` (15/out), sem justificativa registrada e antes do diagnóstico. A frequência só sustenta a `img-dimensions` (`unsized-images` 72,8%; `html-has-lang` 21,7%; `viewport-insight` 13,4%). Perguntar ao orientador o critério combinado. A pergunta é provável na banca.
- **(S14)** Escopo de acessibilidade: o autor manteve o roteiro (sem ARIA/WCAG além das regras previstas). Declarar no texto que o sistema não audita conformidade WCAG; justificar as regras pela frequência das falhas no diagnóstico (não feito).
- **(S15)** Validar o [ADR 015](decisoes/015-regras-da-s15-e-criterio-de-escolha.md) (proposto): critério de escolha (viabilidade + frequência), limiar de 3 imagens da `img-lazy` (não validado; sem auditoria no Lighthouse 13 para medir a frequência), severidades das 8 regras (resolve as pendências da S14 sobre severidades e critério). Referências citadas de memória.
- **(S15)** `fake-button` (2,3% dos sites) e `obsolete-tags` (1,8%) mantidas como demonstração do motor, por decisão do autor; saem junto se as subnotas `sub_interativos`/`sub_obsoletos` forem retiradas (pendência S12). CSS incluído na `render-blocking-hint` (adendo ao ADR 015).
- **(S15)** `npx vitest` reintroduz o `c:` minúsculo no Windows (pendência S11); `node node_modules/vitest/vitest.mjs run` funciona. Registrar em `docs/ambiente/` ou ajustar o `npm test`?

- **(S16)** Validar o [ADR 016](decisoes/016-llm-para-landmarks.md) (proposto): Haiku 5.5 sem temperatura 0 (propostas variam entre rodadas), esqueleto de candidatos, troca só se texto, landmarks e CSS não mudam, teto de US$ 4,50. Gasto total da amostra: US$ 0,0038. Qualidade da escolha não medida. Referências citadas de memória.
- **(S16)** As 13 linhas do `llm-runs.csv` registram `git_commit = ea5af13` (executado antes do commit `d9164c9`). Rodar de novo (cerca de US$ 0,001) ou manter a anotação?
- **(S16)** Cobertura da `landmarks-llm`: age no bruto, então SPA e listagens ficam de fora (estimativa: 107 de 240 sites com candidato).
- **(S16)** Apagar a chave da API no Console ao fim do projeto.
- **(S17)** Validar o [ADR 018](decisoes/018-copia-local-servivel.md) (proposto): cópia local montada do `page.har` (desvio do roteiro, aprovado pelo autor), reescrita só de esquema e host, mesma transformação nas duas variantes, rede externa bloqueada, relógio fixo só na verificação. Verificação: 6 de 8 sites idênticos ao screenshot da coleta; 2 diferenças por animação (contagem regressiva, carrossel).
- **(S17)** Texto corrompido no HAR: 66 CSS/JS em latin1 (56 sites) servidos com `U+FFFD` (o Playwright decodifica como UTF-8). Sem efeito visual nos 6 casos verificados; não medido no corpus.
- **(S17)** Verificar a fidelidade da cópia também nos sites da amostra da S18? Sem limiar global de "fiel" (hoje: acima/abaixo do ruído por site).
- **(S17)** Relógio real no Lighthouse da S18: páginas que dependem da data mostram o conteúdo de hoje (igual nas duas variantes).
- **(S17)** `scripts/landmarks-validacao.ts` não foi reexecutado depois da extração do `compare.ts` (só passou no `tsc`).

- **(S18)** Validar o [ADR 004](decisoes/004-amostra-e-protocolo-da-validacao.md) (proposto): amostra intencional (os 3 piores de cada grupo de tecnologia, n = 12), estratos por tecnologia (e não tipo × tecnologia), janela de 2 × k acrescentada antes das medições, Wilcoxon pareado com Holm. Resultado: nenhum desfecho principal significativo (índice de semântica p = 0,031 bruto, 0,156 com Holm).
- **(S18)** 3 dos 12 primeiros "piores" estavam fora do escopo: `socrates.ct` e `secacademica.ect` (login, regra 4) e `artefatos.imd` (JFrog, ferramenta: critério novo, sem ADR próprio). Foram trocados na amostra por decisão do autor, mas continuam no conjunto principal do diagnóstico. Varrer o corpus atrás de outras telas de login e ferramentas?
- **(S18)** A regra `img-dimensions` distorce imagens quando o CSS fixa só uma dimensão (`image-aspect-ratio` reprovada em 4 de 12 sites). O autor decidiu relatar e não mexer. Corrigir como trabalho futuro?
- **(S18)** A `landmarks-llm` corrigiu 1 de 12 sites (`materialpublic`). Ela só renomeia `div`s, e nos piores sites o conteúdo é formado por irmãos soltos ou montado por JS. Estender para inserir *wrapper*?
- **(S18)** Tag `v1.0` criada com os ADRs 004 e 018 como "proposto". Mudança de código pedida pelo orientador exigiria `v1.0.1`.
- **(S18)** Os `validation.json` registram `gitCommit` `107f56e` e `gitDirty` (medidos antes dos commits). O relógio fixo da verificação trava animações (`materialpublic`, falso positivo). O Wilcoxon descarta pares com delta 0 (n efetivo de 5 a 12): manter ou usar Pratt?

- **(S18b)** A `img-dimensions` ganhou uma guarda de renderização (adendo ao [ADR 014](decisoes/014-motor-de-regras-e-correcoes.md)), e a `landmarks-llm` usa o prompt `landmarks-v2`, com `section`/`article` (adendo ao [ADR 016](decisoes/016-llm-para-landmarks.md)). Na rodada posterior da mesma amostra, nenhuma imagem distorcida (era 4 de 12 sites) e a LLM corrigiu 3 sites (era 1). É análise posterior: a `v1.0` continua sendo o resultado principal. Como apresentar no texto? (adendo ao ADR 004)

- **(S19)** Declaração de uso de IA ([declaracao-uso-ia.md](artigo/declaracao-uso-ia.md)): faltam a orientação da UFRN e do curso, o item sobre a redação do texto e a confirmação da revisão dos diários (pendências do autor). As classificações aceito/alterado/rejeitado foram rascunhadas pelo assistente: basta declarar isso como limite? Os 34 itens de S00–S04 ficaram sem decisão registrada.
- **(S19)** Reprodutibilidade do `dataset.csv` a partir dos brutos não foi retestada na S19 (base: S14). O `CLAUDE.md` diz que os commits levam `Co-Authored-By`, mas só 2 de 109 levam: alinhar.

## Bloqueios
-
