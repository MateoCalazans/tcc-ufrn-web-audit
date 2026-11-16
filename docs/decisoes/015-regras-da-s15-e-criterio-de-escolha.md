# ADR 015 — Regras da S15, critério de escolha e severidades

**Data:** 2026-11-16 · **Status:** proposto

## Contexto
A S15 acrescenta 5 regras ao motor do ADR 014: `img-lazy`, `obsolete-tags`, `heading-skip`,
`fake-button` e `render-blocking-hint`. A lista veio do `ROTEIRO.md` (15/out), escrito antes
do diagnóstico (S13), e a pergunta "por que essas regras?" já ficou pendente na S14. Também
é preciso decidir, para cada regra, o que é corrigido sozinho e o que só gera recomendação,
de onde vem a evidência quando o HTML bruto não basta e qual a severidade de cada achado.
Isso inclui as severidades da S14, que ficaram fora do ADR 014.

## Opções consideradas
1. **Critério de escolha das regras.**
   - Frequência no diagnóstico: justificável com dados, mas o roteiro foi escrito antes deles.
   - Viabilidade (correção segura no HTML bruto ou recomendação com evidência objetiva):
     é o critério que de fato guiou o roteiro, mas sozinho não mostra relevância.
   - Os dois juntos, declarando a frequência de cada regra, inclusive as raras.
2. **"Fora da primeira dobra" (`img-lazy`).** O Lighthouse 13.5 não tem mais a auditoria
   `offscreen-images`, e as posições dos nós (`fullPageScreenshot.nodes`) só existem para os
   elementos citados em alguma auditoria, não para todas as imagens.
   - Renderizar de novo para medir posições: viola a independência dos módulos e a coleta
     congelada.
   - Heurística na ordem do documento, com o elemento LCP do Lighthouse como proteção extra.
3. **Correção automática de `<center>`/`<font>`, `div onclick` e saltos de título.** Corrigir
   tudo × corrigir só o que não muda a renderização.
4. **Evidência da `render-blocking-hint`.** Todo `<script>` síncrono no `<head>` × só os que o
   Lighthouse lista na `render-blocking-insight` da execução mediana (ADR 009).

## Decisão
1. **Critério:** viabilidade + frequência, as duas declaradas. Frequência no conjunto
   principal (n = 217):
   - `render-blocking-hint`: 83,4% (`render-blocking-insight`, `docs/resultados/tabelas/auditorias_falha.csv`);
   - `heading-skip`: 28,6% com `titulos_saltos > 0` no `dataset.csv` (25,8% na `heading-order` do Lighthouse);
   - `fake-button`: 2,3% (`interativos_falsos > 0`);
   - `obsolete-tags`: 1,8% (`obsoletas_whatwg > 0`, contado no DOM renderizado);
   - `img-lazy`: **sem medida** (não há auditoria correspondente no Lighthouse 13; só rodando o módulo no corpus).

   As raras ficam porque já estão no roteiro e custam pouco. O texto deve tratá-las como
   demonstração de capacidade do motor, não como problema relevante do corpus.
2. **`img-lazy`:** as **3** primeiras `<img>` na ordem do documento nunca recebem `lazy`, nem
   a imagem LCP indicada pela `lcp-discovery-insight` (comparação pelo `src` resolvido, ou
   pelo prefixo quando o Lighthouse trunca com `…`). Também são ignoradas as que já têm
   `loading` e as com carregamento por script (`data-src` etc.). Correção automática:
   `loading="lazy"` inserido logo depois do nome da tag, para não cair no mesmo ponto de
   inserção da `img-dimensions`.
3. **Correções:**
   - `obsolete-tags` corrige só `<font>` com apenas `color` e/ou `face`, valores válidos em
     CSS e `</font>` no arquivo → `<span style="color: …; font-family: …">`. `<center>`,
     `size`, cor só válida na sintaxe legada (`ff0000` sem `#`), outros atributos e fechamento
     implícito → só recomendação;
   - `heading-skip` e `fake-button`: só recomendação;
   - `render-blocking-hint`: só recomendação.
4. **`render-blocking-hint`:** só scripts listados pelo Lighthouse, presentes no HTML bruto como
   `<script src>` sem `async`/`defer` e que não sejam `type="module"`. As folhas de estilo da
   mesma auditoria ficam fora (escopo do roteiro). Sem relatório do Lighthouse, não acusa nada.
5. **Definições iguais às do índice:** `heading-skip` usa `nivelDoTitulo` (ADR 010, item 4), e
   `fake-button` usa a definição do ADR 011, item 2 (`div`/`span` + `onclick`, sem `role` e sem
   `tabindex`). As funções são importadas de `src/analyze/semantics.ts`. `obsolete-tags` usa a
   lista `OBSOLETAS_WHATWG`.
6. **Severidades** (`info` < `baixa` < `media` < `alta`):

   | Regra | Caso | Severidade | Dimensão |
   |---|---|---|---|
   | `html-lang` | `lang` ausente ou vazio | alta | semântica |
   | `html-lang` | `lang` com sintaxe inválida | media | semântica |
   | `html-lang` | `lang` de outro idioma | info | semântica |
   | `meta-viewport` | ausente | alta | performance |
   | `meta-viewport` | zoom bloqueado | media | performance* |
   | `meta-viewport` | largura fixa | baixa ou media | performance |
   | `img-dimensions` | qualquer | media | performance |
   | `img-lazy` | qualquer | baixa | performance |
   | `obsolete-tags` | qualquer | baixa | semântica |
   | `heading-skip` | qualquer | media | semântica |
   | `fake-button` | qualquer | media | semântica |
   | `render-blocking-hint` | qualquer | media | performance |

   \* Zoom bloqueado é um problema de acessibilidade, mas o tipo `Dimensao` só tem
   `performance` e `semantica` (ADR 014).

   Critério usado: `alta` = afeta a página inteira e é corrigível; `media` = afeta
   navegação, leitura ou carregamento de forma localizada; `baixa` = ganho pequeno ou
   problema de manutenção; `info` = não é erro.

## Justificativa
- Corrigir só o que não muda a renderização preserva a validade da S18. Uma correção que
  altera a aparência confundiria o efeito medido e quebraria a comparação de screenshots.
  - `<center>` centraliza blocos (tabelas, imagens), e `text-align: center` não.
  - `<button>` traz o estilo padrão do navegador.
  - Trocar o nível de um título muda o tamanho da fonte.
  - `defer` muda a ordem de execução em relação a scripts inline e quebra `document.write`.
- A proteção das primeiras imagens segue a prática do WordPress, que desde a 6.3 deixa sem
  `lazy` as 3 primeiras imagens de conteúdo, e a orientação do web.dev de não usar `lazy` em
  imagens da primeira tela nem no elemento LCP. **Referências citadas de memória: conferir.**
- Usar o Lighthouse como evidência para os scripts bloqueantes evita acusar scripts pequenos
  ou do fim do `<head>` que não atrasam a primeira pintura.
- Mesmas definições do índice: uma recomendação nunca contradiz o indicador que o
  diagnóstico mostrou.

## Consequências
- Positivas: 8 regras com critério declarado; correções automáticas restritas a mudanças
  sem efeito visual esperado; evidência do Lighthouse nas regras que o HTML não basta.
- Negativas / limitações (vão para "Ameaças à validade"):
  - O limiar de 3 imagens é heurístico e não foi validado: imagens de cabeçalho além da 3ª,
    como as de carrosséis, podem receber `lazy` e atrasar a primeira tela. A S18 mostra o
    efeito no LCP.
  - A imagem LCP vem da execução mediana. Quando o LCP é um fundo em CSS, nenhuma imagem é
    protegida além das 3 primeiras.
  - Trocar `<font>` por `<span>` deixa de casar seletores CSS do site que mirem `font`
    (raro, não medido).
  - `obsolete-tags` age sobre o HTML bruto e acusa também elementos dentro de `hidden`; o
    índice os ignora (ADR 010, item 5). Marcação injetada por extensões e salva na página
    (ex.: `<font style="vertical-align: inherit">` do Google Tradutor) é acusada como obsoleta.
  - O parser reabre elementos de formatação não fechados (`<font>`) com clones que herdam a
    posição da tag original. A regra conta uma vez por tag escrita no arquivo.
  - `render-blocking-hint` não vê scripts injetados por JS nem os de sites sem execução
    válida do Lighthouse (25 sites `falha`, S08), e não cobre CSS.
  - `fake-button` e `obsolete-tags` são raras no corpus (≤ 2,3% dos sites).

## Onde aparece no TCC
Cap. 5 (módulo de recomendação): tabela de regras (`docs/artigo/catalogo-regras.md`),
critério de escolha e severidades. Ameaças à validade: limiar do `lazy`, CSS que mira `font`.
