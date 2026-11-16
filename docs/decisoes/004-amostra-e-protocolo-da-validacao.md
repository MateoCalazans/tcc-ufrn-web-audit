# ADR 004 — Amostra da validação e protocolo do antes/depois

**Data:** 2026-11-16 · **Status:** proposto

## Contexto
A segunda parte da pergunta de pesquisa (*"em que medida recomendações geradas
automaticamente melhoram essas métricas?"*) é respondida pelo módulo 4. Ele mede cada site
em duas variantes, a original e a corrigida pelo módulo 3. As duas são cópias locais
(ADR 018), servidas pelo mesmo servidor (regra 7).

Medir todos os sites não cabe no tempo do projeto. Cada site exige 6 execuções do
Lighthouse e 2 renderizações, cerca de 3 a 5 minutos. O roteiro previa uma *"amostra
estratificada de 10–15 sites, piores notas, tipos e tecnologias diferentes"*. Este ADR
fixa o critério de seleção e o protocolo de medição **antes** de qualquer medição. O
critério está em `src/validate/amostra.ts`, e o protocolo, em `src/validate/run.ts`.

Distribuição do conjunto principal (217 sites, `dataset.csv` da `v0.2-analise`), por
tipo × tecnologia:

| tipo \ tecnologia | estático | framework-js | joomla | outro-cms | wordpress |
|---|---|---|---|---|---|
| outro | 94 | 34 | 2 | 8 | 23 |
| evento | 6 | 6 | 0 | 0 | 7 |
| unidade | 10 | 1 | 0 | 1 | 6 |
| laboratório | 4 | 2 | 0 | 0 | 3 |
| departamento | 1 | 0 | 0 | 0 | 3 |
| pós-graduação | 0 | 2 | 0 | 0 | 3 |
| projeto | 1 | 0 | 0 | 0 | 0 |

## Opções consideradas e decisão
1. **Estratos**
   - a) Tipo × tecnologia. Contras: das 35 células, 15 estão vazias e 7 têm 1 ou 2
     sites. 161 dos 217 sites são do tipo `outro`.
   - b) Só tipo. Contras: um estrato teria 161 sites e três teriam 5 ou menos.
   - c) **Tecnologia, nos 4 grupos do ADR 013** (estático, framework-js, wordpress e
     `outro` = joomla + outro-cms), com o tipo como critério de diversidade dentro do
     grupo. ✅
2. **Universo elegível.** Entram os sites que cumprem todas as condições:
   - estão no conjunto principal;
   - têm semântica `ok`;
   - não usam meta refresh (o Lighthouse seguiria o redirecionamento, ADR 010);
   - têm nota de performance e índice;
   - têm cópia local possível (`index.html` e `page.har`);
   - recebem **ao menos 1 correção aplicada pelas regras determinísticas**. A contagem é
     feita em memória, sem LLM.

   Sem correção, original e corrigido seriam idênticos. Sobram 148 sites elegíveis.
3. **"Piores notas"**
   - a) Só a nota de performance. Contras: ignora a dimensão semântica, que é metade da
     pergunta.
   - b) **Soma dos postos da nota de performance e do índice de semântica**, calculados
     entre os elegíveis. A menor soma é o pior site, e o desempate é pelo `id`. ✅
4. **Tamanho e diversidade**
   - 3 sites por grupo, 12 no total, dentro dos 10 a 15 do roteiro.
   - O 1º de cada grupo é o pior.
   - Os seguintes são os piores cujo `tipo` ainda não está no grupo, procurados **só
     entre os 6 piores do grupo** (janela de 2 × 3). Sem tipo novo na janela, entra o pior
     restante.
   - A janela foi acrescentada depois de uma 1ª execução sem ela. Nessa execução, a busca
     por tipo novo puxou o `ojs.ccsa` (performance 91, índice 87,6, 268,5 de soma dos
     postos), um dos melhores do grupo `outro`, e trocou o `socrates.ct` (soma 11,5) pelo
     `ce.ufrn.br` (soma 71,5). A correção veio antes de qualquer medição antes/depois.
5. **Variante corrigida**
   - a) Só regras.
   - b) Regras e LLM em duas variantes. Contras: dobra o tempo do Lighthouse.
   - c) **Uma variante, com regras e `landmarks-llm`** (`npm run recommend -- --llm`,
     ADR 016), que é o sistema da pergunta de pesquisa. O efeito de cada regra não é
     separado. ✅
6. **Medição** (`npm run validate -- run --sample data/validation/amostra.csv`)
   - **Lighthouse:**
     - 3 execuções por variante (regra 6), com o perfil do ADR 007 e um Chrome novo
       por execução;
     - rede externa bloqueada (`BLOQUEIO_DE_REDE`, ADR 018);
     - métricas da execução mediana pela nota (ADR 009). As métricas das 3 execuções
       também ficam no `validation.json`, para sensibilidade.
   - **Ordem:**
     - as execuções das duas variantes são intercaladas (O, C, O, C, O, C);
     - a variante que abre alterna entre os sites (posição par: original);
     - assim, aquecimento e deriva da máquina não favorecem sempre o mesmo lado.
   - **Semântica:**
     - indicadores do módulo 2 (ADR 010/011) e índice (ADR 003);
     - calculados sobre o **DOM renderizado** de cada cópia local, como na análise
       (que usa o `rendered.html`);
     - renderização com os parâmetros da coleta (ADR 006) e o relógio fixado no
       início da renderização da coleta, como na verificação do ADR 018.
   - **Relógio do Lighthouse:** real, igual nas duas variantes (ADR 018).
   - **Saída:**
     - `data/processed/sites/<id>/validation.json`, com o delta = corrigido −
       original;
     - `data/processed/validation.csv`, com uma linha por site.
7. **Análise** (`analysis/validacao.ipynb`)
   - Wilcoxon pareado (*signed-rank*), bilateral, por desfecho.
   - Holm na família de desfechos principais: nota de performance, LCP, CLS, TBT e
     índice de semântica.
   - Efeito: mediana das diferenças e correlação rank-bisserial pareada.
   - Os demais desfechos (subnotas, outras notas) são descritivos.
   - Resultados com n = 12 são exploratórios.

## Justificativa
- 1c: os 4 grupos de tecnologia são os mesmos do diagnóstico (ADR 013), então o
  antes/depois se lê nos mesmos recortes. O tipo, quase todo `outro`, não sustenta
  estratos.
- 2 e 3b: o roteiro pede os piores. Medir sites sem correção só diluiria o efeito com
  deltas nulos por construção. A soma de postos não depende da escala das duas notas.
- 4: a janela mantém o "piores notas" e ainda diversifica o tipo quando há empate
  prático. A regra é determinística e está versionada, então a amostra é reproduzível
  com `npx tsx scripts/amostra-validacao.ts`.
- 6: a intercalação e a mesma origem (servidor local) isolam o efeito da correção. O
  DOM renderizado mantém a mesma definição dos indicadores do diagnóstico.
- 7: com pares e n pequeno, sem suposição de normalidade, o Wilcoxon pareado é o teste
  usual. O tamanho de efeito evita depender só do p-valor (rastreabilidade: "amostra de
  validação pequena").

## Consequências
- Positivas:
  - critério e protocolo fixados antes das medições e reproduzíveis por script;
  - os indicadores brutos de cada variante ficam no `validation.json` (regra 9).
- Negativas / limitações (vão para "Ameaças à validade"):
  - **Amostra intencional, não aleatória.** Os piores sites têm mais margem para
    melhorar, e o efeito não se generaliza para o corpus. Há também regressão à média
    nas notas, mitigada em parte porque original e corrigido são medidos na mesma
    sessão, e não comparados com a coleta.
  - **Correções desiguais.** Na amostra final, 2 dos 12 sites (`semanadeturismo.ccsa`,
    `entbl2020.ccsa`) recebem 1 só correção pelas regras, e o `agir` recebe 136.
    O efeito por site varia com o número e o tipo das correções, que não é controlado.
  - **n = 12 e Holm em 5 desfechos.** O poder estatístico é baixo, e um resultado
    não significativo não prova ausência de efeito.
  - **Notas absolutas não comparáveis.** A cópia local (sem TLS, sem CDN, rede
    bloqueada) não reproduz as notas da coleta. Só o delta tem sentido (ADR 018).
  - **Regras e LLM medidos juntos.** O efeito de cada regra não é separado.
  - **A `landmarks-llm` quase não agiu.**
    - **Amostra final.** Corrigiu 1 dos 12 sites: no `materialpublic.imd`,
      `div.container.main` virou `main` e `div.rodape` virou `footer`, e a subnota
      de landmarks foi de 25 para 75. Nos outros 11, o antes/depois mede só as
      regras.
    - **1ª amostra (antes das trocas).** Nenhuma correção em 12 sites. O detalhe
      vem a seguir. Fonte: `data/processed/llm-runs.csv`, rodadas de 2026-11-16,
      US$ 0,0023 no total da S18.
    - **Sem chamada, em 5 sites.** `ria`, `observatoriodasdesigualdades` e `periodicos`
      não têm landmark ausente no HTML bruto. `semanadeturismo` e `secacademica`
      (framework-js) não têm `div` candidato.
    - **Lista vazia, em 6 sites.** O modelo foi chamado e devolveu `[]`. A conferência
      do esqueleto enviado mostrou que a recusa estava certa nos 6:
      - nenhum `div` candidato correspondia ao landmark ausente;
      - os candidatos eram *splash* de SPA (`artefatos`), tela de carregamento
        (`socrates`), caixa de diálogo (`espacos-denf`), aviso de cookies
        (`profletras`) ou *wrappers* da página inteira (`agir`, `3cnienssup`);
      - nesses sites, o conteúdo principal é formado por irmãos soltos no `body`
        (`section`s, `form`) ou montado por JavaScript.
    - **Proposta barrada, em 1 site.** No `mat`, o modelo propôs `div#content-core` →
      `main`. A troca não foi aplicada porque o CSS seleciona pela tag (salvaguarda
      do ADR 016). Ficou como recomendação manual.
    - **Limite de desenho.** A regra só **renomeia** um `div` existente e não insere
      um *wrapper* em volta de irmãos. Por isso não alcança a estrutura típica dos
      piores sites. A estimativa de cobertura da S16 (107 de 240 sites com
      candidato) conta candidatos, não candidatos adequados.
    - **Decisão do autor:** manter o protocolo e relatar. Estender a regra exigiria
      um ADR novo e mudar o módulo 3 depois da `v0.3`.
  - **A regra `img-dimensions` (ADR 014) distorce imagens em parte da amostra.**
    - **O que acontece.** A regra acrescenta `width` e `height` com as dimensões
      intrínsecas (HAR). Quando o CSS da página fixa só uma das dimensões (ex.:
      `height: 28px` no logo), o atributo passa a valer na outra, e a imagem
      perde a proporção.
    - **Como apareceu.** O Lighthouse acusa a falha como `image-aspect-ratio`
      reprovada só na variante corrigida, e a nota de boas práticas cai de 3 a 4
      pontos. Na amostra final, foi o caso de 4 dos 12 sites: `espacos-denf`,
      `agir`, `profletras` e `mat`.
    - **Decisão do autor.** Relatar como resultado da RQ2 (correção automática que
      ignora o CSS pode piorar a página) e não mexer no módulo 3 depois de ver o
      resultado. A correção da regra fica como trabalho futuro e pergunta ao
      orientador.
  - **Sites fora do escopo entre os "piores".** A conferência visual da S18 achou, na
    1ª amostra, 3 sites que não são portais institucionais públicos:
    - `socrates.ct`: tela de carregamento do Portainer, que pede login;
    - `secacademica.ect`: a página inicial é o formulário de login;
    - `artefatos.imd`: JFrog Artifactory, uma ferramenta de infraestrutura.

    Por decisão do autor, os 3 saíram da amostra (lista `EXCLUIDOS` em
    `scripts/amostra-validacao.ts`, motivo em `amostra.meta.json`) e foram trocados
    pela regra 4 deste ADR. Os substitutos foram `materialpublic.imd` e `ce.ufrn.br`
    (estático) e `entbl2020.ccsa` (framework-js), conferidos no screenshot da coleta.
    As medições já feitas nos 3 sites ficam em disco, fora do `validation.csv`.
    Eles **continuam no conjunto principal do diagnóstico** (`dataset.csv` da
    `v0.2`). A exclusão no corpus, e a busca de outras telas de login e
    ferramentas, é pendência para o orientador. Telas pobres caem entre as
    "piores", então a amostra por piores notas tende a puxá-las.
  - **Semântica sobre o DOM.** Correções que scripts da página desfazem não aparecem
    no índice, o que é o comportamento desejado, mas difere de medir o HTML bruto.

## Onde aparece no TCC
Metodologia (desenho da validação: amostra e protocolo) e Resultados (RQ2: antes/depois).
A amostra intencional e o n vão para "Ameaças à validade".
