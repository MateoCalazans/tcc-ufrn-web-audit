# ADR 013 — Plano de análise estatística do diagnóstico

**Data:** 2026-11-12 · **Status:** proposto

## Contexto
A S13 produz o diagnóstico (capítulo de Resultados) a partir do `dataset.csv`
da tag `v0.2-analise` (242 sites, 83 colunas). O roteiro pede: quantos sites
não têm `main` nem `nav`, a proporção média de `div`, a correlação da semântica
com a acessibilidade e com a performance (Spearman, com p-valor), a comparação
por tecnologia (Kruskal-Wallis) e as 10 auditorias que mais falham.

Antes de olhar os resultados, é preciso fixar:
- a população de cada análise. O ADR 012 deixou no dataset, com flags, os
  9 stubs de meta refresh e os 6 sites `vazio`;
- o tratamento das várias comparações. São vários testes de Spearman sobre
  os mesmos sites, e sem correção a chance de algum falso positivo cresce;
- os grupos de tecnologia. No conjunto principal (n = 217) são `estatico` 116,
  `wordpress` 45, `framework-js` 45, `outro-cms` 9 e `joomla` 2;
- a base do top 10 de auditorias.

Fixar isso agora evita escolher o método pelo resultado, o mesmo argumento do
ADR 010 (1a) e do ADR 012 (2).

## Opções consideradas e decisão
1. **População**
   - a) Todos os 242 sites do dataset. Contras: inclui sites sem medição
     válida (falhas, `parcial`, exclusões) e mistura conjuntos.
   - b) Só o conjunto principal, excluindo os 9 stubs de meta refresh. Contras:
     é uma exclusão decidida sem medir o efeito dela.
   - c) **Conjunto principal, com o recorte de cada teste (escolhida):**
     - análises só de performance: conjunto principal (n = 217);
     - análises que usam semântica ou o índice: conjunto principal com
       semântica `ok` e índice não nulo (n = 213; saem os 6 `vazio`, como no
       ADR 012);
     - cada teste roda **com e sem** os 9 `renderedComRefresh` (n = 204 no
       recorte semântico), e as duas versões são reportadas lado a lado.
2. **Correlações (Spearman)**
   - a) Reportar o p-valor bruto de cada teste. Contras: com 2 correlações
     principais e várias secundárias, a taxa de erro do tipo I por família
     passa de 5%.
   - b) Correção de Bonferroni. Contras: é conservadora demais e perde poder.
   - c) **Correção de Holm-Bonferroni por família (escolhida).** Controla a
     taxa de erro por família, é uniformemente mais poderosa que a de
     Bonferroni e não supõe independência entre os testes. As famílias são:
     - **principal** (2 testes): `indice_semantica` × `nota_accessibility` e
       `indice_semantica` × `nota_performance`;
     - **secundária, exploratória:** `nota_performance` × cada subnota do
       índice (`sub_*`), e `nota_performance` × `elementos_body`. A
       `proporcao_div_span` fica de fora, porque `sub_div_span` =
       100 × (1 − `proporcao_div_span`): o teste seria o mesmo, com o sinal
       trocado, e contaria duas vezes na correção. A redundância foi percebida
       na 1ª execução, e o resultado do teste não mudou com isso.

     Cada teste traz ρ, p bruto, p ajustado (Holm) e n. O ρ é interpretado
     pelo tamanho, e não só pela significância.
3. **Comparação por tecnologia (Kruskal-Wallis)**
   - a) Os 5 grupos como estão. Contras: Joomla tem n = 2, e o teste fica
     dominado pelos grupos grandes, com postos instáveis no grupo pequeno.
   - b) Excluir os grupos pequenos. Contras: descarta 11 sites sem motivo
     metodológico.
   - c) **Grupos com menos de 10 sites são unidos em `outro` (escolhida).**
     O limiar de 10 é uma escolha do autor, e não um valor da literatura.
     Assim, `joomla` (2) e `outro-cms` (9) viram `outro` (11 sites). Ficam
     4 grupos: `estatico`, `wordpress`, `framework-js` e `outro`.
     - variáveis: `indice_semantica` e `nota_performance`;
     - tamanho de efeito: ε² (épsilon ao quadrado);
     - post-hoc de Dunn com correção de Holm, **só** quando o Kruskal-Wallis
       for significativo (α = 0,05).
4. **Top 10 auditorias com falha**
   - a) Contar ocorrências entre todos os sites com Lighthouse. Contras:
     mistura sites `parcial` (uma execução válida).
   - b) **Frequência de sites no conjunto principal (n = 217) que falham em
     cada auditoria (escolhida)**, lendo `auditoriasComFalha` do
     `metrics.json` da execução mediana. Usa o mesmo critério de falha do
     ADR 009 (`score < 0.9`, fora dos grupos `metrics`/`hidden`). Reportar
     a contagem e a proporção.
5. **Descritivas**
   - "sem `main` nem `nav`": `lm_main = 0` e `lm_navigation = 0`, no recorte
     semântico;
   - proporção de `div`: média **e** mediana de `proporcao_div_span`. A
     coluna é div+span (ADR 010), e o texto do TCC deve dizer isso. A média
     sozinha esconde a assimetria.
6. **Nível de significância:** α = 0,05 em todos os testes, bicaudal.
7. **Ferramenta:** `analysis/diagnostico.ipynb` (pandas, scipy) lê só o
   `dataset.csv` e os `metrics.json`. Ele grava tabelas em
   `docs/resultados/tabelas/` e figuras em `docs/resultados/figuras/`, com
   as versões de Python e das bibliotecas e o SHA-256 do dataset usado.
   Se a biblioteca do teste de Dunn (`scikit-posthocs`) não estiver
   disponível, o teste é implementado à mão a partir dos postos e testado
   contra um caso calculado.

## Justificativa
- 1c: cada pergunta usa o maior n válido para ela. A análise com e sem os
  stubs mostra o efeito deles em vez de supô-lo.
- 2c e 3c: os dados são ordinais ou assimétricos (notas do Lighthouse, índice
  limitado a 0–100), o que justifica os testes não paramétricos já previstos
  no roteiro. Holm é a correção mais usada que não exige independência.
- 4b: o critério de falha é o mesmo das colunas `n_auditorias_falha`
  (ADR 009), e a tabela fica coerente com o dataset.

**Referências para o autor conferir** (citadas aqui de memória, sem consulta):
- Spearman, C. (1904). *The proof and measurement of association between two
  things.* American Journal of Psychology.
- Kruskal, W. H.; Wallis, W. A. (1952). *Use of ranks in one-criterion variance
  analysis.* Journal of the American Statistical Association.
- Dunn, O. J. (1964). *Multiple comparisons using rank sums.* Technometrics.
- Holm, S. (1979). *A simple sequentially rejective multiple test procedure.*
  Scandinavian Journal of Statistics.
- Tomczak, M.; Tomczak, E. (2014). *The need to report effect size estimates
  revisited* (ε² para o Kruskal-Wallis). Trends in Sport Sciences.
- Documentação do Lighthouse: *Accessibility scoring* (quais auditorias do
  axe-core entram na nota de acessibilidade e com que pesos). Ela é necessária
  para a limitação de circularidade abaixo.

## Consequências
- Positivas:
  - plano fixado antes dos resultados, para não escolher o teste pelo p-valor;
  - a sensibilidade aos stubs fica medida e visível.
- Negativas / limitações (vão para "Ameaças à validade"):
  - **Circularidade parcial entre semântica e acessibilidade:** a nota de
    acessibilidade do Lighthouse inclui auditorias que medem as mesmas coisas
    que algumas subnotas do índice (por exemplo `html-has-lang`, `image-alt`,
    `label` e `heading-order`). Parte da correlação semântica × acessibilidade
    é esperada por construção. O texto deve dizer isso e listar quais
    auditorias se sobrepõem, a conferir na documentação do Lighthouse;
  - o limiar de 10 sites por grupo é arbitrário. O grupo `outro` junta
    tecnologias diferentes e não deve ser interpretado como uma categoria;
  - a `tecnologia` vem da classificação automática da S04, cuja taxa de acerto
    não foi medida (ADR 005);
  - correlação não implica causa, e o desenho é transversal (uma coleta, em
    2026-11-09);
  - a família secundária de correlações é exploratória e não testa hipóteses
    fixadas a priori.

## Onde aparece no TCC
Metodologia (análise de dados) e Resultados (diagnóstico); a circularidade e o
limiar de grupos vão para "Ameaças à validade".
