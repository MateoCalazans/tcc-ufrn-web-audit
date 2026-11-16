# Declaração de uso de IA

> **Pendências do autor** (o assistente não pode afirmar):
> - verificar se o curso ou a UFRN têm orientação formal sobre uso de IA em TCC e ajustar este texto a ela;
> - completar a última seção (redação do texto do TCC);
> - confirmar a frase sobre a revisão das entradas do diário (marcada com ⚠).
>
> Os números abaixo vêm de `npx tsx scripts/indice-evidencias.ts` (gera
> [indice-evidencias.md](indice-evidencias.md) e `uso-ia.json`) e do
> `data/processed/llm-runs.csv`. Atualizados na S19 (2026-11-16).

Este trabalho usa modelos de linguagem em **dois papéis distintos**, tratados separadamente.

## 1. Ferramenta de desenvolvimento

O assistente Claude Code (Anthropic) foi usado para gerar e revisar código, testes e
rascunhos de documentação técnica (ADRs, diário, relatórios de resultados). Os modelos
foram o Claude Opus 4.8 (sessões S00 a S04) e o Claude Opus 5.5 (S04 a S18b; a troca
ocorreu durante a S04). Todo o código foi revisado pelo autor antes do commit.

O trabalho foi dividido em sessões curtas, cada uma com uma tarefa do roteiro
(`docs/ROTEIRO.md`). Cada sessão começa com um plano proposto pelo assistente e aprovado
pelo autor. As decisões metodológicas foram registradas em ADRs (`docs/decisoes/`). Cada
sessão tem uma entrada no diário (`docs/diario/`), com o pedido, o que o assistente
produziu e a decisão do autor sobre cada item (aceito, alterado ou rejeitado), com o
motivo. As entradas foram rascunhadas pelo assistente ao fim de cada sessão, a partir da
conversa, ⚠ *e revisadas pelo autor antes do commit*.

Os commits estão em nome do autor, e o diário registra a participação do assistente em
cada sessão. Só os dois primeiros commits do repositório (`a78c562` e `9e6189a`, da
estrutura inicial) têm o trailer `Co-Authored-By` do assistente.

### Resumo quantitativo

São 20 entradas de diário: as sessões S00 a S18 do roteiro e a S18b, fora do roteiro. As
tabelas de avaliação somam 161 itens, e 34 deles não têm decisão registrada. São os
itens das sessões S00 a S04, em que a coluna ficou com `?`. Sobre os 127 itens com
decisão:

| Decisão | Itens | % |
|---|---|---|
| Aceito | 45 | 35,4% |
| Aceito (inferido) | 30 | 23,6% |
| Alterado | 50 | 39,4% |
| Rejeitado | 2 | 1,6% |

- "Aceito (inferido)" é o item que o autor não comentou na sessão. O assistente registrou a
  aceitação por inferência, e por isso ela fica separada da aceitação explícita.
- "Alterado" é o item aceito depois de mudanças pedidas pelo autor ou descobertas na
  própria sessão (testes, conferência de dados).
- A tabela por sessão está no [índice de evidências](indice-evidencias.md#uso-do-claude-code-declaração-de-uso-de-ia).

**Limites desta contagem.** A unidade "item" varia de tamanho, de um arquivo de código a
um ADR inteiro. A classificação foi registrada no diário durante o próprio trabalho, e
não por um avaliador independente. As sessões S00 a S04 não têm a classificação.

## 2. Componente do sistema avaliado

No módulo de recomendação (módulo 3), a regra `landmarks-llm` usa um LLM, o Claude
Haiku 5.5 (`claude-haiku-5-5`, API da Anthropic). Ele propõe que elementos genéricos
(`div` e, no prompt v2, também `section` e `article`) virem landmarks (`main`, `nav`,
`header`, `footer`) nos casos que as regras determinísticas não cobrem. O desenho
está no [ADR 016](../decisoes/016-llm-para-landmarks.md) e no adendo da S18b:
- a regra só roda com a flag `--llm`; sem ela, o sistema é determinístico e sem custo;
- os prompts estão versionados em `docs/prompts/`: `landmarks-v1.md` na `v1.0` e
  `landmarks-v2.md` na `v1.0.1-regras`;
- uma proposta só é aplicada se o texto visível, os landmarks existentes e a
  aplicação do CSS não mudarem. Caso contrário, é rejeitada e registrada;
- cada execução é registrada em `data/processed/llm-runs.csv`, com o commit, o prompt e
  seu SHA-256, o modelo pedido e o que respondeu, os tokens, o custo, as propostas
  válidas e rejeitadas e o motivo;
- o modelo roda sem temperatura 0, e as propostas podem variar entre rodadas (ameaça
  registrada na rastreabilidade).

Uso total no projeto, conforme o `llm-runs.csv`:
- 54 execuções da regra em 20 sites, das quais 34 chamaram a API. As outras 20 pararam
  antes: sem landmark ausente ou sem candidato;
- prompt v1: 28 execuções, 13 propostas válidas na checagem estrutural, US$ 0,0061.
  Em 3 execuções, a troca foi barrada depois pela checagem de CSS;
- prompt v2: 26 execuções, 13 propostas válidas na checagem estrutural, US$ 0,0072.
  Em 2 execuções, a troca foi barrada pela checagem de CSS;
- custo total de **US$ 0,0133**.

O efeito nas métricas está no capítulo de Resultados (validação, ADR 004): a LLM
corrigiu 1 de 12 sites na `v1.0` e 3 de 12 na análise posterior.

## 3. Redação do texto do TCC

*(A preencher pelo autor.)* O texto do TCC <foi / não foi> redigido com auxílio de IA.
<Se foi, descrever em quê: revisão, tradução, sugestão de estrutura etc.>
