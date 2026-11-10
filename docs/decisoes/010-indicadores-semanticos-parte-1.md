# ADR 010 — Indicadores semânticos, parte 1 (div+span, landmarks, títulos)

**Data:** 2026-11-10 · **Status:** proposto

## Contexto
A S10 implementa os três primeiros indicadores de semântica HTML
(`src/analyze/semantics.ts`) sobre o `rendered.html`, o DOM serializado pelo
Chromium depois do `networkidle` (ADR 006). Cada indicador tem escolhas de
definição que mudam os números: o que entra no denominador, quando um `header`
é landmark e o que conta como "salto" de título. Também é preciso decidir o que
fazer com os 23 sites com meta refresh (pendência do ADR 009, item 5).

Pela verificação da S10 (`npx tsx scripts/semantics-check.ts`, citada no
diário), os 23 sites com meta refresh se dividem assim:
- **13** têm um `rendered.html` sem a tag de refresh. O Playwright seguiu o
  redirecionamento e gravou a página de destino (ex.: `acervus`, `sigsaude`);
- **10** têm um `rendered.html` que ainda contém a tag (9 deles no conjunto
  principal do ADR 009). A página gravada é o stub de redirecionamento, e não o
  destino que o Lighthouse mediu (ex.: 7 páginas quase iguais de ~8,9 KB, como
  `emai`, `memo` e `sida`, além de `revistaeduquestao`, com atraso de 180 s).

Uma leitura preliminar com expressão regular, feita antes do código, contou 14
e 9; a diferença foi corrigida pelo detector com parser (abaixo).

## Opções consideradas
1. **Meta refresh**
   - a) **Analisar o `rendered.html` como está, com duas flags:** `metaRefresh`
     (do `collect.json`, o HTML bruto redireciona) e `renderedComRefresh` (o
     DOM gravado ainda tem uma tag de refresh **fora de `<noscript>`**; a que
     está dentro de `<noscript>` só vale com JS desligado, caso de
     `enterpriseenrollment`). Nenhuma exclusão agora; a S12/S13 decide
     entre manter, separar ou fazer sensibilidade. Prós: não decide com base
     no resultado e mantém os indicadores brutos (regra 9). Contras: nos 9
     casos, a semântica e a performance descrevem páginas diferentes.
   - b) Excluir os 9 (ou os 23). Contras: decide antes de ver o tamanho do
     efeito e perde dados.
   - c) Coletar de novo a página de destino. Contras: viola o congelamento da
     coleta (regra 8, ADR 008).
2. **Denominador da proporção div+span**
   - a) **Todos os elementos dentro de `<body>`** (sem contar o próprio
     `body`), exceto `script`, `style`, `template` e `noscript` e o que estiver
     dentro deles. Também não conta o que está **dentro** de `svg` e `math`:
     o próprio `svg`/`math` conta como 1 elemento, mas seus `path`, `g`… não,
     porque não são elementos HTML e inflariam o denominador em páginas com
     ícones vetoriais.
   - b) Todos os elementos do documento. Contras: `head`, `meta`, `link` e os
     filhos de SVG diluem a proporção sem dizer nada da marcação do conteúdo.
3. **Landmarks**
   - a) **Mapeamento implícito da HTML-AAM + `role` explícito.** `header` só
     vira `banner` (e `footer` só vira `contentinfo`) quando não está dentro de
     `article`, `aside`, `main`, `nav` ou `section`, nem de um elemento com
     `role` `article`, `complementary`, `main`, `navigation` ou `region`.
     `nav` → `navigation`, `main` → `main`. Um `role` explícito vale mais que
     o implícito (o primeiro token do atributo; ex.: `<header role="presentation">`
     não é landmark, `<div role="main">` é). Conta-se quantos `main` há, porque
     a especificação permite só um visível.
   - b) Só contar as tags `header`/`nav`/`main`/`footer`. Contras: conta como
     `banner` o `header` de cada notícia e ignora `role` explícito.
4. **Hierarquia de títulos**
   - a) **Títulos = `h1`–`h6` e `role="heading"`, na ordem do documento.** O
     nível é o `aria-level` (inteiro ≥ 1) quando presente, senão o da tag
     (`hN` → N; `role="heading"` sem `aria-level` → 2, o padrão da WAI-ARIA).
     Um `hN` com outro `role` explícito não conta. **Salto** = cada título cujo
     nível passa do anterior em mais de 1 (`h2`→`h4` = 1 salto, `h1`→`h4` = 1
     salto, de tamanho 3). Subir de nível (`h4`→`h2`) não é salto. O primeiro
     título não é comparado com nada (a falta de `h1` já aparece na contagem
     de `h1`).
   - b) Contar o primeiro título diferente de `h1` como salto. Contras: conta
     duas vezes o mesmo problema que o nº de `h1` já mede.
5. **Elementos ocultos**
   - **Análise estática do DOM serializado, sem CSS computado.** Elementos
     escondidos por CSS contam. Só ficam de fora das contagens de landmarks e
     títulos os elementos com o atributo `hidden` e o que estiver dentro deles.
     O denominador da proporção div+span conta todos.

## Decisão
1a, 2a, 3a, 4a e 5. Aprovado pelo autor no plano da S10 (*"approved"*). Três
detalhes foram acrescentados durante a implementação, sem nova consulta: o
interior de `svg`/`math` fora do denominador (2a), o `noscript` ignorado na
flag `renderedComRefresh` (1a) e o primeiro título não comparado (4a).

Site com `rendered.html` sem nenhum elemento contável no `body` recebe status
`vazio` e indicadores sem proporção (`null`). No corpus são 6: `ppget` e `sire`,
e 4 páginas idênticas "Página de Teste de Hospedagem Web" da STI (`eject.ect`,
`farmacia.ccs`, `gmag.fisica`, `histed.ce`), que estão no conjunto principal de
performance. O tratamento delas fica para a S12.

## Justificativa
- A HTML-AAM (W3C) é a especificação que diz como o navegador expõe cada
  elemento às tecnologias assistivas. Usar o mesmo mapeamento faz o indicador
  medir o que um leitor de tela encontra, e não só a presença de tags.
- A WAI-ARIA 1.2 define o nível padrão 2 para `role="heading"` e diz que
  `role` explícito sobrescreve o implícito.
- O WCAG 2.2 (critérios 1.3.1 e 2.4.6) e o eMAG (recomendações 1.3 e 1.5)
  pedem títulos hierárquicos e regiões identificadas, mas não definem uma
  métrica. As contagens acima são operacionalizações deste trabalho.
- Na opção 1a, decidir a exclusão antes de medir o efeito seria escolher o
  método pelo resultado. As flags deixam a decisão para quando houver os
  números.

## Consequências
- Positivas: indicadores definidos de forma reproduzível e alinhados às
  especificações; nenhum site sai do dataset sem motivo registrado.
- Negativas / limitações (vão para "Ameaças à validade"):
  - Nos sites com `renderedComRefresh`, a semântica descreve o stub de
    redirecionamento, e a performance, a página de destino.
  - Sem CSS computado, conteúdo escondido (menus mobile duplicados, modais)
    entra nas contagens.
  - O `role` explícito é aceito sem validar se é permitido naquela tag.
  - O `rendered.html` é um instantâneo após o `networkidle`; conteúdo
    carregado depois disso não aparece.

## Onde aparece no TCC
Metodologia (indicadores de semântica, base do índice do ADR 003/S12) e
Ameaças à validade.
