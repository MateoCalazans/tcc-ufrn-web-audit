# ADR 016 — LLM para landmarks: modelo, entrada, saída e validação

**Data:** 2026-11-16 · **Status:** proposto

## Contexto
A S16 acrescenta ao módulo 3 o único uso de LLM do sistema: quando a página não tem algum
dos 4 landmarks do índice (ADR 010: banner, navigation, main, contentinfo), o modelo propõe
qual `<div>` existente vira `header`/`nav`/`main`/`footer`. No conjunto principal (n = 217,
`dataset.csv`), 160 sites (73,7%) não têm pelo menos um dos 4, 35 (16,1%) não têm nenhum e
123 (56,7%) não têm `main`. Esses números vêm do DOM renderizado (S12), mas a regra age
sobre o HTML bruto (ADR 014).

O roteiro exige: prompt versionado, saída em JSON estruturado (nunca HTML livre), HTML
resultante válido, mesmo texto visível, comparação de screenshots, registro de tokens e
custo e teste com resposta mockada. O LLM é **componente do sistema avaliado**, então
modelo, parâmetros e prompt precisam ser fixos e registrados.

## Opções consideradas
1. **Modelo.**
   - Claude Opus 5.5 (US$ 4 / 20 por 1M de tokens de entrada/saída): o mais capaz, caro
     para o corpus.
   - Claude Sonnet 5.5 (US$ 2 / 10).
   - Claude Haiku 5.5 (US$ 0,10 / 0,50 até 100 mil tokens de prompt): o mais barato. A
     tarefa é classificar blocos, sem texto longo.
2. **Temperatura.** O Claude Haiku 5.5 rejeita `temperature`, `top_p` e `top_k` com valor
   diferente do padrão (erro 400). Por isso não há temperatura 0 nesse modelo.
3. **Entrada.**
   - HTML inteiro: caro, e as páginas chegam a centenas de KB.
   - Esqueleto compacto só com os `<div>` candidatos: barato, e o modelo só escolhe entre
     elementos que o código consegue trocar.
4. **Forma do "seletor".**
   - CSS gerado pelo modelo: pode não existir ou não ser único.
   - Identificador do esqueleto (`c1`, `c2`…), que o código resolve para a posição da tag
     no arquivo.
5. **Correção.** Só recomendação, ou troca automática do nome da tag.

## Decisão
1. **Modelo `claude-haiku-5-5`**, `effort: "low"`, `max_tokens: 4000`, pensamento adaptativo
   no padrão do modelo. Escolha do autor: *"oq for mais barato e funcione"*. Se a taxa de
   propostas válidas na amostra for baixa, a próxima versão do prompt (`landmarks-v2`)
   pode trocar o modelo, com novo registro.
2. **Temperatura no padrão do modelo** (não configurável). O cabeçalho do prompt registra isso.
3. **Entrada = esqueleto** (`montarEsqueleto` em `src/recommend/llm.ts`). Candidatos:
   - `<div>` visíveis (sem `hidden` no elemento nem em ancestral), sem `role`;
   - com as tags de abertura e de fechamento no arquivo;
   - com texto ou `<img>`;
   - fora de landmarks e de secionadores (`article`, `aside`, `main`, `nav`, `section`,
     `header`, `footer` e os `role` equivalentes): um `header` lá dentro não seria banner
     (HTML-AAM).

   O esqueleto tem no máximo 150 candidatos, em ordem de largura. Cada linha traz:
   profundidade, pai, `id`/`class`, tipos de filhos, contagem de links, títulos,
   formulários e imagens, e os 80 primeiros caracteres do texto. O prompt também recebe a
   URL, o título e os landmarks presentes e ausentes.
4. **Saída** por `output_config.format` (JSON Schema): `{ propostas: [{ candidato, elemento,
   justificativa }] }`. O código revalida tudo e **rejeita**, registrando o motivo:
   - candidato inexistente;
   - landmark já presente;
   - candidato repetido;
   - mais de 1 `header`/`main`/`footer` ou mais de 2 `nav`;
   - aninhamento entre propostas (exceto `nav` dentro de `header`/`footer`). Vale a
     proposta que veio antes.
5. **Correção automática**: troca do nome nas tags de abertura e de fechamento (posições de
   origem, ADR 014), aplicada só se, com todas as trocas do site:
   - o texto do `body` (sem `script/style/template/noscript`) continua igual;
   - cada landmark proposto passa a ser contado pela definição do ADR 010;
   - nenhuma regra do CSS da página muda de alvo (adendo da S16, depois do caso
     `gpc.ect.ufrn.br`, ver Resultados). O CSS vem dos `<style>` e das folhas
     `<link rel="stylesheet">` guardadas no HAR (sem rede). Para cada regra com seletor
     de tipo `div`/`header`/`nav`/`main`/`footer`, compara o conjunto de elementos
     selecionados antes e depois da troca, considerando a regra inteira (em
     `div, main { … }` o elemento continua selecionado). Ficam de fora as regras só com
     declarações neutras (`display:block`, `margin:0`, `padding:0`, `border:0`,
     `font:inherit`…), porque os 5 elementos têm o mesmo estilo padrão no navegador.

   Se não, as propostas ficam só como recomendação, e a mensagem cita os seletores.
6. **Escopo**: a regra só entra com `npm run recommend -- --llm`. Sem a flag, o módulo segue
   determinístico e sem custo. Ela é a última da lista (perde em conflito de edições).
   **Teto de gasto**: o crédito do autor para todo o projeto é de US$ 5. Antes de cada
   chamada, se o gasto já registrado (soma de `custo_usd` no `llm-runs.csv`) mais o pior
   caso da chamada (1 token a cada 2 caracteres de entrada, `max_tokens` de saída) passa
   de `--teto-usd` (padrão US$ 4,50), a chamada não é feita e o site fica registrado com
   o motivo "orçamento esgotado".
7. **Registro**: uma linha por site em `data/processed/llm-runs.csv`, com:
   - prompt e SHA-256;
   - modelo pedido e o que respondeu, id da resposta;
   - tokens de entrada e de saída e custo em US$;
   - propostas, válidas e rejeitadas com motivo;
   - erro e duração.

   A tabela de preços está no código (`custoUsd`), com a data da consulta. O mesmo
   registro vai no `recommendations.json` (campo `llm`).
8. **Validação na S16** (`scripts/landmarks-validacao.ts`, exploratória): compara o original
   com o original + só as trocas da `landmarks-llm`:
   - texto igual;
   - vnu nos dois arquivos;
   - screenshot da página inteira, com tudo servido do HAR da coleta (`routeFromHAR`, sem
     rede, regra 7) e o original fotografado 2 vezes para medir o ruído.

   A validação de performance continua no módulo 4.

## Resultados da amostra (S16)
Amostra: 5 sites do conjunto principal sem nenhum landmark no DOM renderizado
(29 elegíveis, `sample(n=5, random_state=16)`). Registro em `data/processed/llm-runs.csv`
(13 linhas, 3 rodadas) e em `data/processed/sites/<id>/landmarks-validacao.json`.

- 2 de 5 sem chamada, por não haver `<div>` candidato no bruto: `ecaan1.ect` (listagem
  vazia do Apache) e `erros.si` (SPA Angular).
- 3 de 5 chamados (`gpc.ect`, `lar.ect`, `quimica`): 1192–1759 tokens de entrada,
  325–1142 de saída, US$ 0,0003–0,0007 por site. Todas as respostas vieram em
  `end_turn`, dentro do esquema e sem proposta rejeitada.
- Gasto total das 3 rodadas: **US$ 0,0038** (soma de `custo_usd`).
- 1ª rodada (só com a verificação de texto e landmarks): 3 trocas aplicadas, todas
  para `main`. Texto igual e o mesmo número de erros do vnu antes e depois nos 3
  sites. Screenshots servidos do HAR:
  - `lar.ect`: 0 pixel diferente;
  - `quimica`: 0,063% de pixels diferentes, contra 0,052% de ruído entre duas fotos
    do original;
  - **`gpc.ect`: 1,56%, contra 0% de ruído.** O CSS `div#content { width: 940px; … }`
    deixou de valer, e o subtítulo mudou de lugar. Esse caso motivou a verificação do CSS.
- 3ª rodada (com a verificação do CSS):
  - `gpc.ect` ficou só como recomendação (`CSS depende da tag: div#content`);
  - `lar.ect` (0 pixel diferente) e `quimica` (0,054%, contra 0,051% de ruído) tiveram
    as trocas aplicadas;
  - no `quimica`, o modelo propôs `.logo` → `header` e `.site-info` → `main` em vez do
    `.comming-soon` → `main` da 1ª rodada. A justificativa dele mesmo diz que o bloco
    "cobre apenas parte do conteúdo". A mesma entrada deu propostas diferentes, como
    esperado sem temperatura 0.

## Justificativa
- O esqueleto e os identificadores impedem que o modelo produza HTML ou aponte para algo
  que não existe: o LLM só **classifica**, e a edição é determinística. Isso separa o
  "LLM como componente" do resto do motor, que é auditável.
- O custo por site fica em frações de centavo (ver resultados no diário da S16), o que
  permite rodar o corpus inteiro, se o autor pedir.
- Landmarks são a subnota de maior peso do índice (20, ADR 003), junto com os títulos.
- Referências citadas de memória, a conferir: HTML-AAM (mapeamento de `header`/`footer`
  conforme o contexto); WCAG 2.x, critério 1.3.1 e técnica ARIA11; eMAG 3.1, recomendação
  1.5 (blocos de conteúdo).

## Consequências
- Positivas: a regra é testável sem rede (cliente injetável, resposta mockada); cada
  execução é rastreável até o prompt (SHA-256) e o modelo; nenhuma resposta do modelo vira
  HTML sem passar pelas regras do código.
- Negativas / limitações (vão para "Ameaças à validade"):
  - Sem temperatura 0, a mesma entrada pode dar propostas diferentes. A reprodutibilidade
    é a do registro (`llm-runs.csv`, ids das respostas), não a de uma nova execução.
  - O pensamento adaptativo não aparece na resposta (só o JSON), então a justificativa é
    a frase pedida no prompt, não o raciocínio do modelo.
  - Sites cujo HTML bruto não tem `<div>` (SPA, listagem de diretório) ficam de fora.
    A regra age no bruto (ADR 014), e a frequência do índice vem do DOM renderizado.
  - A verificação do CSS não cobre:
    - `@import`;
    - CSS injetado por script;
    - atributos `style`;
    - scripts que selecionem `div` (ex.: `querySelector("div.menu")`).

    Esses casos ficam com o aviso na mensagem e com os screenshots da validação.
  - A qualidade da escolha (o bloco certo?) não é medida aqui. Medir exigiria rotulagem
    manual de uma amostra (não feita). A amostra mostrou variação entre rodadas
    (`quimica`).
  - Corte em 150 candidatos: páginas muito aninhadas podem perder blocos fundos.

## Adendo (S18b, 2026-11-16): prompt `landmarks-v2` e candidatos além de `div`
- **Problema.** Na amostra da validação da `v1.0` (ADR 004), o modelo devolveu lista
  vazia em 6 sites e acertou ao recusar. Os candidatos eram só `div`, e nos piores
  sites o conteúdo estava em `section`s, `form` ou irmãos sem `div` em volta.
- **Decisão do autor.** Ampliar os candidatos (*"c- ampliar"*), sem envolver irmãos num
  *wrapper*.
- **O que muda:**
  - **Candidatos:** `div`, `section` e `article`. `section` e `article` entram só
    fora de outro elemento secionador, e o código não desce neles.
  - **Ficam de fora:** `form`, `table`, `ul` e similares, porque trocar o nome
    quebraria o formulário, a tabela ou a lista.
  - **Troca:** a de `section`/`article` segue as mesmas salvaguardas do `div` (texto
    igual, landmarks esperados, nenhum seletor de CSS que cite a tag muda de alvo).
    O `TIPO_TROCAVEL` passou a incluir `section` e `article`.
- **Prompt `landmarks-v2.md`.** O texto muda só onde citava `<div>`. Regras, esquema,
  modelo e `effort` são os mesmos. O v1 fica intacto (usado na S16 e na `v1.0`).
- **Limite que continua.** Conteúdo formado por irmãos soltos (ex.: `profletras`, 12
  `section`s no `body`) não tem um candidato único para `main`, e o modelo deve
  continuar recusando.

## Onde aparece no TCC
Metodologia, módulo de recomendação ("LLM como componente": modelo, prompt versionado,
entrada, saída estruturada, validação); Resultados (custo, taxa de propostas válidas,
validação da amostra); Ameaças à validade.
