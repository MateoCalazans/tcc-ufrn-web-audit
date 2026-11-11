# ADR 003 — Índice de semântica HTML

**Data:** 2026-11-11 · **Status:** proposto

## Contexto
Os ADRs 010 e 011 definem os indicadores brutos de semântica (S10–S11). A
pergunta de pesquisa pede um retrato do "estado de semântica" de cada site e,
na S18, a comparação antes/depois das correções. Para isso é preciso um número
único por site, sem esconder os brutos: eles ficam todos no dataset (regra 9),
e o índice é uma camada por cima. A banca pode questionar a fórmula, a
normalização e os pesos, por isso eles estão aqui, com uma análise de
sensibilidade.

## Opções consideradas
1. **Normalização**
   - a) **Absoluta:** cada subnota é uma função fixa dos brutos do próprio
     site (0–100). Prós: a nota de um site não depende dos outros; a cópia
     corrigida da S18 pode ser comparada com a original. Contras: os pontos de
     corte são escolhas do autor.
   - b) Relativa ao corpus (percentis, z-score, min–max). Contras: a nota
     muda se o corpus mudar e não serve para antes/depois.
2. **Agregação**
   - a) **Média ponderada das subnotas**, com renormalização dos pesos quando
     uma subnota não se aplica. Prós: simples de explicar e de auditar.
   - b) Média geométrica ou mínimo. Contras: um único zero derruba o site
     todo, e o índice fica dominado pelo pior item.
   - c) Pesos por PCA ou outro método estatístico. Contras: pesos dependem do
     corpus (mesmo problema de 1b) e são difíceis de justificar normativamente.
3. **Pesos:** propostos (abaixo) × iguais, com os dois calculados e comparados.

## Decisão
1a, 2a e os pesos propostos, com os pesos iguais como sensibilidade.

### Subnotas (0–100, maior = melhor)
Notação: os campos são os de `IndicadoresSemanticos` (`src/analyze/semantics.ts`).

| # | Subnota | Cálculo | Não se aplica (N/A) quando | Peso proposto |
|---|---|---|---|---|
| 1 | Landmarks | 25 × [`banner` > 0] + 25 × [`navigation` > 0] + 25 × [`main` = 1] + 25 × [`contentinfo` > 0] | nunca | 20 |
| 2 | Títulos | 0 sem títulos; senão 50 × [`h1` = 1] + 50 × (1 − `saltos` / (`total` − 1)), e a 2ª parcela vale 50 com um título só | nunca | 20 |
| 3 | Alternativa em imagens | 100 × (1 − `semAlt` / `total`) | não há `img` | 15 |
| 4 | Rótulos de campos | 100 × (1 − `semLabel` / `total`) | não há `input` que precise de rótulo | 15 |
| 5 | div+span | 100 × (1 − `proporcao`) | nunca (site `vazio` não tem índice) | 10 |
| 6 | Metadados | 50 × [`lang` ≠ `null`] + 50 × [`temTitle`] | nunca | 10 |
| 7 | Interativos falsos | 100 × (1 − `falsos` / `comOnclick`) | não há `div`/`span` com `onclick` | 5 |
| 8 | Obsoletos e layout | 50 × [`obsoletas.roteiro` = 0] + 50 × [`layoutDeclarada` + `layoutHeuristica` = 0] | nunca | 5 |

`[condição]` vale 1 ou 0. Soma dos pesos: 100.

**Índice** = Σ (peso × subnota) / Σ peso, somando só as subnotas que se
aplicam. Sem nenhum elemento contável (status `vazio` ou `sem-arquivo`, ADR
010), o índice é `null`. **Índice com pesos iguais:** a mesma fórmula, com peso
1 em todas as subnotas.

### Fora do índice (só colunas brutas no dataset)
- Estrutura (`article`, `section`, `aside`, `figure`, `ul`, `ol`): a ausência
  não é erro (uma página pode, com razão, não ter `article`).
- `meta viewport` e `meta description`: são de adaptação ao celular e de SEO,
  e não de semântica.
- Validação vnu: é opcional (ADR 011, item 8) e mede o DOM serializado.
- Contagens de sensibilidade (`semAltComAlternativa`,
  `semLabelComPlaceholderOuTitle`) e a lista completa de obsoletos do WHATWG.

## Justificativa
- **Normalização absoluta (1a):** é a única compatível com a validação da
  S18 (cópia original × cópia corrigida, regra 7). Os pontos de corte seguem
  diretamente as normas: um `main` só (HTML, WAI-ARIA), um `h1`, nenhum salto
  de nível (WCAG 2.2, 1.3.1 e 2.4.6; eMAG 1.3), todo `img` com `alt` (1.1.1;
  eMAG 3.6), todo campo com rótulo (1.3.1 e 3.3.2; eMAG 6.2), idioma e título
  da página (3.1.1 e 2.4.2; eMAG 3.1).
- **Proporções em vez de contagens** nas subnotas 3, 4 e 7, para não punir
  páginas grandes só por terem mais imagens ou campos.
- **N/A em vez de nota cheia** quando não há oportunidade de errar (página
  sem imagens, sem campos ou sem `onclick`). Dar 100 inflaria o índice das
  páginas mais pobres em conteúdo.
- **Pesos propostos.** Os itens que afetam diretamente a navegação e a
  compreensão por tecnologia assistiva pesam mais:
  - Títulos e landmarks são os meios de navegação estrutural do leitor de
    tela. Na pesquisa WebAIM Screen Reader User Survey #10 (dez/2023–jan/2024,
    1.539 respostas), **71,6%** dos usuários começam a procurar informação
    numa página longa navegando pelos títulos. Só 3,7% começam pelos
    landmarks, mas 31,8% navegam por landmarks "sempre que disponíveis" ou
    "com frequência". Os dados sustentam o peso alto dos títulos; o peso igual
    dos landmarks é escolha do autor (os landmarks são a única forma de pular
    direto para o conteúdo principal) e é testado pela sensibilidade.
  - `alt` e rótulos são critérios WCAG de nível A com falha direta para quem
    não enxerga a tela.
  - div+span e metadados são sinais mais indiretos.
  - Interativos falsos e obsoletos/layout quase não variam no corpus (5 e 4
    sites, S11) e pesam pouco.
- **Sensibilidade.** O índice com pesos iguais é calculado para todo site. A
  correlação de Spearman entre os dois rankings, no conjunto principal, mede
  quanto a escolha dos pesos muda as conclusões.

## Consequências
- Positivas: um número por site que pode ser comparado antes/depois; cada
  ponto do índice pode ser rastreado até um bruto e uma norma.
- Negativas / limitações (vão para "Ameaças à validade"):
  - pesos e pontos de corte são do autor; a análise de sensibilidade mostra o
    efeito, mas não o elimina;
  - as subnotas 1, 6 e 8 são em degraus (0/25/50…), e a 2 mistura degrau e
    proporção;
  - o índice herda as limitações dos ADRs 010 e 011 (DOM estático, stubs de
    meta refresh, heurística de tabela).

## Onde aparece no TCC
Metodologia (índice de semântica, contribuição do trabalho), Resultados
(diagnóstico, S13) e Ameaças à validade.
