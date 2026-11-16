# Índice de evidências

> Gerado por `npx tsx scripts/indice-evidencias.ts`. Não editar à mão: rodar o script de novo.
> Gerado em 2026-11-16T20:39:47.412Z no commit `d0f16a9bf6fe25b49e7807dad55d912503eb90fd`.

Lista das decisões (ADRs), dos marcos de código (tags) e das entradas do diário,
com o resumo do uso do Claude Code tirado das tabelas "Avaliação do que o Claude produziu".
A ligação objetivo → evidência está em [rastreabilidade.md](rastreabilidade.md).

## ADRs (17)

| ADR | Título | Data | Status | Adendos |
|---|---|---|---|---|
| [001](../decisoes/001-escopo-pagina-inicial.md) | Analisar apenas a página inicial de cada site | 2026-10-15 | proposto (validar com o orientador) | — |
| [002](../decisoes/002-criterios-inclusao-corpus.md) | Critérios de inclusão e exclusão do corpus | 2026-10-15 | proposto | — |
| [003](../decisoes/003-indice-de-semantica.md) | Índice de semântica HTML | 2026-11-11 | proposto | — |
| [004](../decisoes/004-amostra-e-protocolo-da-validacao.md) | Amostra da validação e protocolo do antes/depois | 2026-11-16 | proposto | Adendo (S18b, 2026-11-16): rodada posterior com as regras revistas |
| [005](../decisoes/005-acessibilidade-na-triagem.md) | O que conta como "acessível" na triagem (certificados, rede de origem, validação da classificação) | 2026-11-09 | proposto (complementa o ADR 002; aguarda o orientador) | — |
| [006](../decisoes/006-parametros-da-coleta-renderizada.md) | Parâmetros da coleta renderizada (HTML bruto, DOM, screenshot, HAR) | 2026-11-09 | proposto | — |
| [007](../decisoes/007-parametros-do-lighthouse.md) | Parâmetros da medição com o Lighthouse | 2026-11-09 | proposto | — |
| [008](../decisoes/008-coleta-retomavel-sem-nova-tentativa.md) | Coleta retomável, sem nova tentativa de sites com falha | 2026-11-09 | proposto | Adendo (2026-11-09, S08): o que aconteceu na coleta oficial |
| [009](../decisoes/009-metricas-de-performance-na-analise.md) | Métricas de performance na análise | 2026-11-10 | proposto | Adendo (2026-11-10, S10): exclusão do `enterpriseenrollment` |
| [010](../decisoes/010-indicadores-semanticos-parte-1.md) | Indicadores semânticos, parte 1 (div+span, landmarks, títulos) | 2026-11-10 | proposto | — |
| [011](../decisoes/011-indicadores-semanticos-parte-2.md) | Indicadores semânticos, parte 2 (estrutura, interativos, metadados, alt, label, obsoletos, vnu) | 2026-11-10 | proposto | — |
| [012](../decisoes/012-dataset-e-tratamentos.md) | Dataset da análise: saídas, conjuntos e tratamentos | 2026-11-11 | proposto | — |
| [013](../decisoes/013-plano-de-analise-estatistica.md) | Plano de análise estatística do diagnóstico | 2026-11-12 | proposto | — |
| [014](../decisoes/014-motor-de-regras-e-correcoes.md) | Motor de regras e correções automáticas | 2026-11-12 | proposto | Adendo (S18b, 2026-11-16): guarda de renderização na `img-dimensions` |
| [015](../decisoes/015-regras-da-s15-e-criterio-de-escolha.md) | Regras da S15, critério de escolha e severidades | 2026-11-16 | proposto | Adendo (2026-11-16, ainda na S15) — CSS na `render-blocking-hint` e regras raras mantidas |
| [016](../decisoes/016-llm-para-landmarks.md) | LLM para landmarks: modelo, entrada, saída e validação | 2026-11-16 | proposto | Adendo (S18b, 2026-11-16): prompt `landmarks-v2` e candidatos além de `div` |
| [018](../decisoes/018-copia-local-servivel.md) | Cópia local servível: fonte, reescrita de URLs e verificação | 2026-11-16 | proposto | Adendo (S18, 2026-11-16): barra dupla e verificação na amostra |

Números sem arquivo: ADR 017 (reservado para a S20, interface visual; ver `docs/ROTEIRO.md`, Fase 7).

## Tags (5)

| Tag | Commit | Data | Mensagem |
|---|---|---|---|
| `v0.1-triagem` | `ccb217e` | 2026-11-09 | Fim do modulo 0 (triagem): corpus de 2026-11-04, 242 incluidos |
| `v0.2-analise` | `f44cf53` | 2026-11-11 | Fim da fase 3 (análise): dataset.csv com indicadores brutos e índice de semântica (ADR 003) |
| `v0.3-recomendacao` | `042b0d7` | 2026-11-16 | Módulo 3 (recomendação) concluído: regras determinísticas + landmarks-llm |
| `v1.0` | `eb3d69d` | 2026-11-16 | v1.0: pipeline completo (triagem, coleta, análise, recomendação, validação), código congelado na S18 |
| `v1.0.1-regras` | `84ca81d` | 2026-11-16 | v1.0.1-regras: guarda de renderização na img-dimensions (adendo ADR 014) e landmarks-v2 (adendo ADR 016); análise posterior da validação (S18b) |

## Diário (21 entradas)

| Sessão | Data | Título | Sessão do roteiro | Ferramenta | Itens avaliados |
|---|---|---|---|---|---|
| [S00](../diario/2026-10-19-s00.md) | 2026-10-19 | Esqueleto do projeto TypeScript | S00 | Claude Code (Opus 4.8) | 9 |
| [S01](../diario/2026-10-19-s01.md) | 2026-10-19 | Registro do ambiente | S01 | Claude Code (Opus 4.8) | 5 |
| [S02](../diario/2026-10-20-s02.md) | 2026-10-20 | Normalização da lista | S02 | Claude Code (Opus 4.8) | 5 |
| [S03](../diario/2026-10-20-s03.md) | 2026-10-20 | Verificação DNS + HTTP + robots | S03 | Claude Code (Opus 4.8) | 4 |
| [S04](../diario/2026-11-04-s04.md) | 2026-11-04 | Classificação e corpus.csv (parte 1) | S04 — concluída em 2026-11-09 sem a revisão manual (ver "Continuação") | Claude Code (Opus 4.8 → Opus 5.5, troca de modelo durante a sessão) | 11 |
| [S05](../diario/2026-11-09-s05.md) | 2026-11-09 | HTML bruto + DOM renderizado | S05 | Claude Code (Opus 5.5) | 6 |
| [S06](../diario/2026-11-09-s06.md) | 2026-11-09 | Lighthouse 3× com mediana | S06 | Claude Code (Opus 5.5) | 5 |
| [S07](../diario/2026-11-09-s07.md) | 2026-11-09 | Orquestração retomável | S07 | Claude Code (Opus 5.5) | 5 |
| [S08](../diario/2026-11-10-s08.md) | 2026-11-10 | Coleta completa e congelamento | S08 | Claude Code (Opus 5.5) | 11 |
| [S09](../diario/2026-11-10-s09.md) | 2026-11-10 | Métricas de performance | S09 | Claude Code (Opus 5.5) | 6 |
| [S10](../diario/2026-11-10-s10.md) | 2026-11-10 | Semântica (parte 1) | S10 | Claude Code (Opus 5.5) | 5 |
| [S11](../diario/2026-11-11-s11.md) | 2026-11-11 | Semântica (parte 2) | S11 | Claude Code (Opus 5.5) | 9 |
| [S12](../diario/2026-11-11-s12.md) | 2026-11-11 | Índice de semântica + dataset | S12 | Claude Code (Opus 5.5) | 8 |
| [S13](../diario/2026-11-12-s13.md) | 2026-11-12 | Relatórios e panorama | S13 | Claude Code (Opus 5.5) | 5 |
| [S14](../diario/2026-11-12-s14.md) | 2026-11-12 | Motor de regras + 3 regras | S14 | Claude Code (Opus 5.5) | 15 |
| [S15](../diario/2026-11-16-s15.md) | 2026-11-16 | Mais 5 regras de recomendação | S15 | Claude Code (Opus 5.5) | 14 |
| [S16](../diario/2026-11-16-s16.md) | 2026-11-16 | LLM para landmarks | S16 | Claude Code (Opus 5.5); modelo do sistema avaliado: Claude Haiku 5.5 | 11 |
| [S17](../diario/2026-11-16-s17.md) | 2026-11-16 | Cópia local servível | S17 | Claude Code (Opus 5.5) | 8 |
| [S18](../diario/2026-11-16-s18.md) | 2026-11-16 | Amostra e antes/depois | S18 | Claude Code (Opus 5.5) | 11 |
| [S18b](../diario/2026-11-16-s18b.md) | 2026-11-16 | Guarda de imagens e LLM v2 (análise posterior) | fora do roteiro | Claude Code (Opus 5.5) | 8 |
| [S19](../diario/2026-11-16-s19.md) | 2026-11-16 | Pacote de reprodutibilidade | S19 | Claude Code (Opus 5.5) | 7 |

## Uso do Claude Code (declaração de uso de IA)

21 sessões com diário, 168 itens na tabela de avaliação. Desses, 34 não têm decisão registrada (sessões S00, S01, S02, S03, S04, com `?` na coluna); os percentuais abaixo sobre os 134 itens com decisão registrada:

- Aceito: 45 (33,6%)
- Aceito (inferido): 33 (24,6%)
- Alterado: 54 (40,3%)
- Rejeitado: 2 (1,5%)

"Aceito (inferido)" é o item que o autor não comentou na sessão; a aceitação foi registrada pelo Claude por inferência e fica separada da aceitação explícita.

Modelos registrados no campo "Ferramenta": Opus 4.8 (S00, S01, S02, S03, S04); Opus 5.5 (S04, S05, S06, S07, S08, S09, S10, S11, S12, S13, S14, S15, S16, S17, S18, S18b, S19).

| Sessão | Itens | Aceito | Aceito (inferido) | Alterado | Rejeitado | Não registrado |
|---|---|---|---|---|---|---|
| S00 | 9 | 0 | 0 | 0 | 0 | 9 |
| S01 | 5 | 0 | 0 | 0 | 0 | 5 |
| S02 | 5 | 0 | 0 | 0 | 0 | 5 |
| S03 | 4 | 0 | 0 | 0 | 0 | 4 |
| S04 | 11 | 0 | 0 | 0 | 0 | 11 |
| S05 | 6 | 5 | 0 | 1 | 0 | 0 |
| S06 | 5 | 2 | 1 | 2 | 0 | 0 |
| S07 | 5 | 3 | 1 | 1 | 0 | 0 |
| S08 | 11 | 6 | 1 | 4 | 0 | 0 |
| S09 | 6 | 2 | 0 | 4 | 0 | 0 |
| S10 | 5 | 3 | 0 | 2 | 0 | 0 |
| S11 | 9 | 4 | 2 | 3 | 0 | 0 |
| S12 | 8 | 6 | 0 | 2 | 0 | 0 |
| S13 | 5 | 1 | 1 | 3 | 0 | 0 |
| S14 | 15 | 2 | 5 | 6 | 2 | 0 |
| S15 | 14 | 2 | 8 | 4 | 0 | 0 |
| S16 | 11 | 3 | 3 | 5 | 0 | 0 |
| S17 | 8 | 2 | 2 | 4 | 0 | 0 |
| S18 | 11 | 2 | 3 | 6 | 0 | 0 |
| S18b | 8 | 2 | 3 | 3 | 0 | 0 |
| S19 | 7 | 0 | 3 | 4 | 0 | 0 |
| **Total** | **168** | **45** | **33** | **54** | **2** | **34** |
| % do total | | 26,8% | 19,6% | 32,1% | 1,2% | 20,2% |
