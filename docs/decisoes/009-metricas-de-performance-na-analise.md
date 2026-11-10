# ADR 009 — Métricas de performance na análise

**Data:** 2026-11-10 · **Status:** proposto

## Contexto
A coleta oficial (S08, congelada em 2026-11-09) gravou 3 relatórios do
Lighthouse por site (`lh1.json`..`lh3.json`) e um `lighthouse.json` com o índice
da execução mediana pela nota de performance (ADR 007, 7a) e o índice que o
`computeMedianRun` (FCP/TTI) escolheria (7b). A análise (S09) precisa decidir:

- de qual execução saem as métricas (nota, LCP, CLS, TBT, FCP, Speed Index,
  peso, requisições, JS/CSS não usado), já que os dois critérios **divergem em
  132 de 225 sites** (`docs/resultados/coleta.md`);
- o que conta como "auditoria com falha";
- o que fazer com os sites sem 3 execuções válidas. No corpus, **219 sites
  têm 3 válidas, 6 têm 1 válida (as outras 2 com `NO_NAVSTART`) e 17 têm 0**:
  13 `NO_FCP`, 2 `ERRORED_DOCUMENT_REQUEST`, 1 `NOT_HTML`, e 1 sem nota de
  performance nas 3. A contagem foi feita com um script `node -e` sobre os
  `lighthouse.json`, citado no diário da S09;
- como tratar `pingifes.ufrn.br` (meta refresh para tela de login, regra 4) e
  `comunica.ufrn.br` (stream de áudio, `NOT_HTML`), que ficaram no corpus
  (decisão A do autor na S08), e os 23 sites com meta refresh.

## Opções consideradas
1. **Execução que alimenta as métricas**
   - a) **Execução inteira mediana pela nota (ADR 007, 7a).** Todas as métricas
     saem do mesmo relatório real, por um critério simples de explicar.
   - b) Execução do `computeMedianRun`, com o mesmo argumento do relatório
     inteiro e o critério do PageSpeed Insights. Contras: troca o critério
     fixado antes da coleta, depois de ver os dados.
   - c) Mediana métrica a métrica. Contras: mistura execuções diferentes, e o
     resultado não corresponde a nenhum carregamento real da página.
2. **Auditoria com falha**
   - a) **`score < 0.9`**, o mesmo limiar que o relatório do Lighthouse usa para
     mostrar uma auditoria como "aprovada", só para os modos `binary`, `numeric`
     e `metricSavings`. Ficam de fora os modos `informative`, `manual`,
     `notApplicable` e `error`, e também as auditorias que só aparecem nos
     grupos `metrics` (FCP, LCP, TBT, CLS e SI, que já entram como valores) e
     `hidden`, que o relatório não mostra. No Lighthouse 13, o `hidden` inclui
     TTI, max-potential-FID, `layout-shifts`, `redirects` e
     `server-response-time` (esses dois foram substituídos pelos *insights*).
     Também ficam fora as auditorias que não estão em nenhuma das 4 categorias.
   - b) `score === 0`. Contras: ignora as auditorias numéricas e de economia
     com nota intermediária.
3. **Sites sem 3 execuções válidas**
   - a) **Status `completo` (3 válidas), `parcial` (1–2) ou `falha` (0).**
     `parcial` mantém as métricas da execução mediana entre as válidas, como diz
     o ADR 007, mas fica fora do conjunto principal da análise. `falha` tem
     métricas nulas e o motivo (códigos de `runtimeError`).
   - b) Descartar `parcial` e `falha`. Contras: perde os indicadores brutos
     (regra 9) e esconde um resultado: páginas que não pintam (`NO_FCP`)
     também dizem algo sobre os portais.
4. **`pingifes` e `comunica`**
   - **Exclusão na análise, com motivo**, numa lista versionada no código
     (`src/analyze/exclusoes.ts`). Os dados brutos ficam como estão (regra 8).
5. **Meta refresh**
   - **Coluna `metaRefresh` (booleana), lida do `collect.json`.** O tratamento
     (manter, separar ou excluir) fica para a S12/S13, junto com a semântica,
     onde a diferença entre o HTML bruto e o renderizado pesa mais.

## Decisão
1a, 2a, 3a, 4 e 5. O `computeMedianRun` (`nFcpTti`) e a amplitude da nota de
performance entre as execuções seguem como colunas de sensibilidade.

## Justificativa
O critério 7a foi fixado no ADR 007, **antes** da coleta. Trocá-lo agora,
depois de ver a divergência, seria escolher o método pelo resultado. Um
relatório inteiro segue a orientação do projeto Lighthouse sobre variabilidade
(não combinar métricas de execuções diferentes). O limiar 0.9 é o mesmo do
relatório que os gestores dos sites veem, e a recomendação (módulo 3) parte
dessa mesma lista.

## Consequências
- Positivas: métricas coerentes entre si, rastreáveis até um `lh<n>.json`, e
  nenhum site some do dataset sem motivo registrado.
- Negativas / limitações (vão para "Ameaças à validade"):
  - Em 132 de 225 sites, a execução escolhida não é a que o PageSpeed Insights
    escolheria. A coluna `nFcpTti` permite medir o efeito.
  - Os 6 sites `parcial` têm uma única medição.
  - O limiar 0.9 é convenção da ferramenta, não da literatura.
  - Meta refresh ainda sem tratamento definido.

## Onde aparece no TCC
Metodologia (análise de performance; critérios de exclusão) e Ameaças à
validade.

## Adendo (2026-11-10, S10): exclusão do `enterpriseenrollment`
Na verificação da S10, `enterpriseenrollment.ufrn.br` apareceu redirecionando
para o Intune da Microsoft (`https://intune.microsoft.com/`) e terminando na
tela de login do Azure (título *"Sign in to Microsoft Azure"*). Pela regra 4
(só páginas públicas, sem login), o autor decidiu excluí-lo da análise com
motivo `login` (*"Sim pode remover"*), do mesmo jeito que o `pingifes` (item 4).
Os dados brutos ficam como estão (regra 8).

Com isso, o **conjunto principal passa de 218 para 217 sites**. A mediana da
nota de performance continua 61, a de LCP passa de 8.983 ms para 9.019 ms, e
a de auditorias com falha por site continua 17 (`npx tsx scripts/performance-check.ts`).
