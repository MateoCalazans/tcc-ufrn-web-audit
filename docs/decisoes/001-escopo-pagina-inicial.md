# ADR 001 — Analisar apenas a página inicial de cada site

**Data:** 2026-10-15 · **Status:** proposto (validar com o orientador)

## Contexto
O corpus tem ~1.000 sites candidatos. Analisar todas as páginas exigiria crawling,
multiplicaria o tempo de coleta e a carga sobre os servidores da UFRN, e tornaria
a comparação entre sites desigual (sites com 5 páginas × sites com 500).

## Opções consideradas
1. **Só a página inicial** — coleta viável no prazo; comparação justa; é a página
   mais acessada e a "vitrine" da unidade. Contra: não representa páginas internas.
2. **Página inicial + N páginas internas (amostra)** — mais representativo; contra:
   critério de escolha das internas é arbitrário, custo ×N.
3. **Crawl completo** — inviável no prazo e eticamente mais invasivo.

## Decisão
Opção 1.

## Justificativa
Prazo, carga mínima nos servidores, comparabilidade. Estudos de avaliação de portais
governamentais costumam usar a página inicial como unidade de análise
(confirmar com as referências da revisão).

## Consequências
- Negativas: resultados não generalizam para páginas internas → registrar em
  "Ameaças à validade" e em "Trabalhos futuros".

## Onde aparece no TCC
Metodologia (escopo do corpus); Ameaças à validade.
