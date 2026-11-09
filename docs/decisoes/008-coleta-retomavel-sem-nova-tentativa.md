# ADR 008 — Coleta retomável, sem nova tentativa de sites com falha

**Data:** 2026-11-09 · **Status:** proposto

## Contexto
A coleta completa (S08) roda as etapas `page` (ADR 006) e `lighthouse` (ADR 007)
nos 242 sites incluídos, um site por vez, e deve levar várias horas. Ela precisa
sobreviver a quedas (energia, suspensão da máquina, `Ctrl+C`) sem refazer o que
já foi coletado e sem violar a regra 8 (dados brutos imutáveis). Também é
preciso decidir o que fazer com sites cuja coleta terminou com falha
(`completo: false`: timeout, conexão recusada, `runtimeError` do Lighthouse) e
se o navegador da etapa `page` pode ficar aberto enquanto o Lighthouse mede.

## Opções consideradas
1. **O que conta como "já coletado"**
   - a) **A presença do registro da etapa** (`collect.json` / `lighthouse.json`), que é gravado por último. Uma etapa interrompida antes do registro (ex.: `lh1.json` gravado, sem `lighthouse.json`) não foi coletada e é refeita do zero, sobrescrevendo os arquivos parciais.
   - b) A presença de qualquer arquivo na pasta — contras: uma queda no meio deixaria a etapa pela metade para sempre.
2. **Sites com falha (`completo: false`)**
   - a) **Não tentar de novo.** A falha é o resultado da coleta naquele momento e é registrada como dado, com o motivo.
   - b) Nova tentativa explícita (`--retry-incomplete`), guardando a anterior em `tentativa-1/` — recupera falhas passageiras, mas dá a alguns sites mais chances que a outros e complica a análise.
3. **Navegador da etapa `page` durante o Lighthouse**
   - a) Um Chromium aberto a coleta inteira — contras: processo ocioso disputando memória/CPU com a medição.
   - b) **Um Chromium do Playwright por site, fechado antes do Lighthouse.**
4. **Proteção contra mistura de coletas**
   - **Se algum site selecionado já tiver registro, o comando só roda com `--resume`.** Evita somar sem querer dados do piloto (`gitDirty: true`) à coleta oficial.

## Decisão
1a, 2a, 3b, 4. Ordem por site: `page` e depois `lighthouse`. Com `Ctrl+C`/SIGTERM
a coleta termina o site atual e para; um segundo sinal aborta na hora (a etapa
em andamento fica sem registro e é refeita na retomada). O resumo final é
calculado a partir do disco (todos os sites do corpus selecionados), não só da
execução atual, e agrupa as falhas por motivo.

## Justificativa
Gravar o registro por último torna a retomada segura: um registro existente
nunca é tocado (regra 8) e só etapas sem registro são refeitas. Não repetir
sites com falha trata todos os sites igualmente (uma tentativa cada) e mantém o
dado bruto como foi observado; a taxa de falha por motivo é ela mesma um
resultado sobre a disponibilidade dos portais. Fechar o navegador antes do
Lighthouse isola a medição, coerente com o "um Chrome por vez" do ADR 007.

## Consequências
- Positivas: coleta interrompível e retomável sem perda; uma tentativa por site; resumo reprodutível a partir de `data/raw/`.
- Negativas / limitações (vão para "Ameaças à validade"):
  - Falhas passageiras (instabilidade de rede no instante da coleta) contam como falha do site.
  - Um site retomado pode ter `page` e `lighthouse` coletados em horários (ou dias) diferentes; os horários ficam em `meta.collectedAt` de cada registro.
  - Abrir um Chromium por site acrescenta alguns segundos por site.

## Onde aparece no TCC
Metodologia (procedimento de coleta) · Ameaças à validade (falhas passageiras).
