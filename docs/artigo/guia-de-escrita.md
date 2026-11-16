# Guia de escrita do TCC (material de consulta)

> Para o autor consultar ao escrever o texto. Linguagem simples, de propósito.
> Cada número vem de um arquivo do repositório (indicado entre parênteses). Antes de
> citar um número no texto, confira o arquivo: se os dados forem regerados, o guia não
> se atualiza sozinho.
>
> Escrito em 2026-11-16. Fontes principais: ADRs em `docs/decisoes/`, `docs/resultados/`,
> `data/processed/dataset.csv` e os CSVs de validação.

---

## 1. O trabalho em uma frase

Medimos a velocidade (performance) e a qualidade da marcação HTML (semântica) das
páginas iniciais dos sites públicos da UFRN. Depois, testamos se correções geradas
automaticamente, por regras e por uma IA (LLM), melhoram essas medidas.

**Pergunta de pesquisa:** qual é o estado de performance e semântica HTML dos sites
públicos da UFRN, e em que medida recomendações geradas automaticamente (regras + LLM)
melhoram essas métricas?

A pergunta tem duas partes, e o texto pode seguir a mesma divisão:
1. **Diagnóstico:** como estão os sites hoje?
2. **Validação:** as correções automáticas ajudam?

---

## 2. Conceitos para explicar ao leitor (em palavras simples)

| Termo | Explicação curta |
|---|---|
| **Performance** | Quão rápido a página aparece e responde no celular. |
| **Lighthouse** | Ferramenta gratuita do Google que dá uma nota de 0 a 100 para a página. É a mesma do PageSpeed Insights. Usamos a nota de performance e algumas medidas de tempo. |
| **LCP** | Tempo até o maior elemento da tela, normalmente uma imagem ou um título grande, aparecer. |
| **CLS** | Quanto a página "pula" enquanto carrega, por exemplo quando um texto desce porque uma imagem apareceu acima dele. |
| **TBT** | Tempo em que a página fica travada e não responde a toques, ocupada rodando JavaScript. |
| **Semântica HTML** | Usar a tag certa para cada coisa: `<nav>` para o menu, `<main>` para o conteúdo principal, `<h1>` para o título. Isso ajuda leitores de tela (usados por pessoas cegas), buscadores e manutenção. |
| **Landmarks** | As "regiões" da página que o leitor de tela anuncia: cabeçalho, menu, conteúdo principal e rodapé. |
| **Índice de semântica** | Nota de 0 a 100 criada neste trabalho (ADR 003). Junta 8 aspectos da marcação. |
| **Mediana** | O valor do meio. Metade dos sites fica abaixo dela e metade acima. É mais justa que a média quando há sites muito fora da curva. |
| **Cópia local** | Uma cópia da página guardada no computador, montada com os arquivos baixados na coleta. Serve para comparar o original com o corrigido nas mesmas condições. |
| **LLM** | Modelo de linguagem, o tipo de IA do ChatGPT e do Claude. Aqui ele só sugere qual bloco da página é o menu, o conteúdo e assim por diante. Quem altera o HTML é o código. |

**Faixas de nota do Lighthouse**, que dão um jeito simples de apresentar os resultados:
de 90 a 100 é "bom", de 50 a 89 é "precisa melhorar" e de 0 a 49 é "ruim". Cite a
documentação do Lighthouse ao usar essas faixas.

---

## 3. Como o sistema funciona (os módulos)

O sistema é uma "linha de montagem" de 5 etapas. Cada etapa lê arquivos, faz o seu
trabalho e grava o resultado em disco para a próxima. Nenhuma etapa chama a outra
diretamente. Por isso, dá para refazer qualquer etapa sem repetir as anteriores.

| # | Módulo | O que faz, em palavras simples | Produz |
|---|---|---|---|
| 0 | **Triagem** | Recebe a lista de endereços da UFRN, limpa duplicatas e erros de digitação, visita cada endereço uma vez e decide se o site entra no estudo. | `data/corpus.csv` |
| 1 | **Coleta** | Abre cada site incluído num navegador automático com tela de celular. Guarda o HTML, a página como ficou depois do JavaScript, uma foto da tela e o registro de tudo o que foi baixado. Roda o Lighthouse 3 vezes. | `data/raw/<site>/` |
| 2 | **Análise** | Calcula, a partir dos arquivos guardados, as medidas de performance e de semântica e o índice. Junta tudo numa tabela, com uma linha por site. | `data/processed/dataset.csv` |
| 3 | **Recomendação** | Aplica 9 regras ao HTML de cada site. Algumas só apontam o problema; outras corrigem sozinhas. Uma das regras usa a LLM. | `recommendations.json`, `fixed.html`, `fix.diff` |
| 4 | **Validação** | Monta duas cópias locais de cada site, a original e a corrigida. Mede as duas do mesmo jeito e calcula a diferença. | `validation.json`, `validation*.csv` |
| — | **Relatórios e estatística** | Notebooks em Python fazem tabelas, testes e gráficos. | `docs/resultados/` |
| — | **Interface** (ADR 017) | Tela local para ver os resultados de cada site e analisar uma URL nova. Não altera os dados do TCC. | `npm run ui` |

**Ferramentas:** Node.js com TypeScript (o código), Lighthouse (performance),
Playwright (navegador automático), cheerio (leitura do HTML), Claude Haiku (a LLM) e
Python/pandas (estatística).

**Regras éticas seguidas na coleta** (para a seção de Metodologia):
- no máximo 2 sites ao mesmo tempo, com pausa entre os acessos;
- o robô se identifica (User-Agent com nome do projeto e contato);
- respeita o `robots.txt`, o arquivo em que o site diz o que robôs podem visitar;
- só páginas públicas: nunca faz login nem envia formulários;
- só a página inicial.

---

## 4. Por que cada escolha foi feita

Esta seção é a mais útil para a Metodologia e para responder à banca. Cada item
aponta o ADR em que a decisão está registrada com detalhes.

### Escopo e corpus
- **Só a página inicial (ADR 001).** Cabe no prazo, pesa pouco nos servidores da UFRN e
  deixa a comparação justa entre sites de 5 páginas e de 500. É a "vitrine" da unidade.
  *Limitação:* os resultados não valem para as páginas internas.
- **Quem entra no estudo (ADR 002).** Entra o site que responde com sucesso, entrega uma
  página HTML pública, sem login, e não proíbe robôs no `robots.txt`. Quem sai recebe um
  código de motivo (fora do ar, endereço inexistente, erro, login...). A lista original
  tinha 1.290 linhas, misturando sites, sistemas e servidores de teste. Era preciso um
  critério objetivo e repetível.
- **Certificado de segurança inválido não exclui (ADR 005).** Um visitante comum consegue
  entrar depois de um aviso do navegador. A triagem foi feita de fora da rede da UFRN,
  como um cidadão acessaria. *Limitação:* sites que só abrem de dentro da UFRN ficaram
  de fora.

### Coleta e medição
- **Tela de celular e Lighthouse no modo padrão (ADR 006 e 007).** É o mesmo padrão do
  PageSpeed Insights, o que facilita comparar com outros estudos. A maioria dos acessos
  hoje é pelo celular.
- **3 medições por site, usando a do meio (ADR 007 e 009).** O Lighthouse varia de uma
  medição para outra. Usar a do meio evita que uma medição muito boa ou muito ruim, por
  acaso, decida o resultado.
- **Os dados guardados não são alterados (regra 8).** Tudo é recalculado a partir dos
  arquivos da coleta. Qualquer pessoa pode refazer as contas.
- **Coleta que pode ser retomada (ADR 008).** Se o computador cair no meio, a coleta
  continua de onde parou, sem refazer nem alterar o que já foi gravado. Isso aconteceu
  de verdade: a coleta caiu por falta de memória no site 87 de 242 e foi retomada.

### Medidas de semântica
- **Índice de semântica com 8 aspectos e pesos (ADR 003).** Os pesos são landmarks 20,
  títulos 20, texto alternativo das imagens 15, rótulos de campos 15, proporção de
  `div`/`span` 10, metadados 10, botões falsos 5 e tags obsoletas 5. Os títulos pesam
  muito porque 71,6% dos usuários de leitor de tela começam a navegar por eles (pesquisa
  WebAIM nº 10). Cada nota depende só do próprio site, o que permite comparar antes e
  depois. *Limitação:* os pesos são escolha do autor. Por isso, o índice com pesos iguais
  também foi calculado, e os rankings quase não mudam (ρ = 0,984). As medidas brutas
  também ficam no dataset, para a banca conferir (regra 9).
- **Os detalhes de cada medida estão nos ADRs 010 e 011.** Exemplos: um "salto de título"
  é pular um nível, como de h2 para h4; `alt=""` é válido, porque marca uma imagem
  decorativa; um `placeholder` não conta como rótulo de campo.

### Correções automáticas
- **As regras corrigem o HTML original e mudam só os trechos necessários (ADR 014).**
  Fica fácil conferir o que mudou, linha por linha, no `fix.diff`.
- **Só é corrigido sozinho o que não muda a aparência da página (ADR 015).** Uma
  correção que muda o visual confundiria o efeito medido. Problemas mais delicados,
  como saltos de título, viram apenas recomendação.
- **Proteção para imagens (adendo ao ADR 014).** Na primeira rodada, a correção de
  largura e altura das imagens distorceu imagens em 4 de 12 sites. A versão revista
  desenha a página antes e depois e desfaz a correção se o tamanho da imagem mudar.
- **A LLM só classifica; quem edita é o código (ADR 016).** A LLM recebe um resumo dos
  blocos da página e diz qual é o menu, o conteúdo principal e assim por diante. O
  código confere a sugestão e só troca a tag se o texto da página continuar igual e o
  visual não depender da tag antiga. Foi usado o modelo mais barato (Claude Haiku). O
  custo foi de frações de centavo por site.

### Validação (antes/depois)
- **Comparar cópia local com cópia local, nunca com o site no ar (regra 7, ADR 018).** O
  site real muda de um dia para o outro e depende da rede. As duas cópias, original e
  corrigida, ficam no mesmo computador, no mesmo servidor, com a internet bloqueada. A
  única diferença entre elas é a correção. *Consequência:* as notas absolutas da cópia
  não são as do site real. O que vale é a diferença entre as duas cópias.
- **Plano fixado antes de medir (ADR 004).** O critério de escolha dos sites e os testes
  foram escritos e commitados antes das medições. Assim, ninguém escolhe o método depois
  de ver o resultado.
- **Três rodadas de validação, com papéis diferentes:**
  1. **v1.0, o resultado principal:** 12 sites, os piores de cada grupo de tecnologia.
  2. **S18b, a rodada posterior:** os mesmos 12 sites, com as regras corrigidas depois de
     ver a v1.0. Mostra o efeito da revisão.
  3. **Censo, a análise secundária:** todos os 134 sites elegíveis. Ver a seção 6.

---

## 5. Resultados do diagnóstico (números simples)

### Do total ao conjunto analisado (funil)
(`docs/resultados/triagem.md`, `docs/resultados/coleta.md`)

| Etapa | Sites |
|---|---:|
| Linhas na lista de endereços | 1.290 |
| Depois de juntar duplicatas e variações (www, .edu.br) | 1.100 |
| Depois de tirar endereços de infraestrutura e teste (nomes com dns, ldap, api, homolog, teste, staging...) | 1.050 |
| **Incluídos no estudo** | **242** |
| Com coleta completa (página e Lighthouse) | 217 |

Principais motivos de exclusão: não respondeu a tempo (437), endereço não existe (214),
erro de página (80) e pede login (36). Dos 242 incluídos, 52 têm certificado de
segurança com problema.

O **conjunto principal** tem 217 sites (`conjunto_principal = true` no dataset). A
análise de semântica usa 213 deles: 4 páginas de teste estavam vazias.

### Performance (217 sites, `data/processed/dataset.csv`)

| Faixa da nota do Lighthouse | Sites | % |
|---|---:|---:|
| Bom (90 a 100) | 23 | 10,6% |
| Precisa melhorar (50 a 89) | 154 | 71,0% |
| Ruim (0 a 49) | 40 | 18,4% |

- Nota mediana: **61** (metade dos sites tem 61 ou menos).
- Só **16 sites (7,4%)** mostram o maior elemento da tela em até 2,5 s, o limite
  considerado "bom" para o LCP. Em **171 (78,8%)**, ele leva mais de 4 s. O LCP mediano é
  de cerca de **9 s**.
- **185 sites (85,3%)** não "pulam" na tela (CLS bom, até 0,1).
- **154 sites (71,0%)** ficam travados no máximo 200 ms (TBT bom).
- A página mediana pesa **2,4 MB** e faz **36 requisições**.
- Problemas mais comuns apontados pelo Lighthouse (`docs/resultados/tabelas/auditorias_top10.csv`):
  - arquivos que travam o carregamento: 83,4%;
  - cache mal configurado: 80,2%;
  - imagens mal otimizadas: 80,2%;
  - JavaScript não usado: 78,3%;
  - imagens sem largura e altura: 72,8%;
  - contraste de cores insuficiente: 71,0%.

Para citar os limites "bom" do LCP, CLS e TBT, use a documentação do web.dev e do
Lighthouse.

### Semântica (213 sites, `docs/resultados/tabelas/descritivas.csv`)

- Índice de semântica mediano: **65,3** de 100. Metade dos sites está entre 55,4 e 77,1.
  O pior tem 19,9 e o melhor, 98,2.
- **119 sites (55,9%)** não marcam o conteúdo principal (`<main>`).
- **46 sites (21,6%)** não têm nem `<main>` nem `<nav>`.
- **76 sites (35,7%)** não têm título principal (`<h1>`).
- **46 sites (21,6%)** não informam o idioma da página.
- Em média, cerca de **40%** dos elementos da página são `div` ou `span`, tags genéricas
  sem significado.

### Comparações (frases simples para o texto)
(`docs/resultados/tabelas/kruskal_tecnologia.csv` e `spearman.csv`; plano no ADR 013)

- **A tecnologia do site faz diferença.** Notas medianas de performance: estático 62,5,
  WordPress 62, framework JS 52 e "outro" (outros CMS) 72. A diferença entre os grupos é
  maior do que o acaso explicaria. Nos sites feitos com framework JS, a nota fica mais
  baixa.
- **No índice de semântica,** WordPress (74,8) e "outro" (80,2) ficam acima dos
  estáticos (62,1).
- **Semântica boa não significa site rápido.** Não há relação entre o índice e a nota de
  performance (ρ = −0,01, praticamente zero).
- **Semântica e acessibilidade andam juntas de forma moderada** (ρ = 0,47). Cuidado ao
  escrever: parte disso é esperada, porque a nota de acessibilidade do Lighthouse mede
  algumas das mesmas coisas que o índice (ADR 013).
- **Páginas com mais elementos tendem a ser mais lentas** (ρ = −0,26, relação fraca).

### O que o sistema recomendou (conjunto principal)
(`data/processed/sites/<site>/recommendations.json`, contado em 2026-11-16)

O módulo de recomendação rodou em **207 dos 217 sites**. Ficaram de fora 8 páginas que
não são portais públicos e 2 sem os arquivos da coleta. Foram **4.422 recomendações**,
com mediana de 12 por site. Dessas, **2.491 (56%) foram corrigidas automaticamente**;
as demais são orientações para quem mantém o site.

| Regra | O que aponta | Recomendações | Corrigidas sozinhas | Sites |
|---|---|---:|---:|---:|
| `img-dimensions` | imagem sem largura e altura | 1.491 | 1.104 | 121 |
| `render-blocking-hint` | arquivo que trava o carregamento | 1.311 | 0 | 173 |
| `img-lazy` | imagem que podia carregar depois | 1.213 | 1.213 | 104 |
| `landmarks-llm` | região da página sem marcação (via LLM) | 119 | 108 | 70 |
| `heading-skip` | salto na hierarquia de títulos | 116 | 0 | 49 |
| `html-lang` | idioma da página ausente ou inválido | 99 | 40 | 99 |
| `meta-viewport` | página não adaptada ao celular | 48 | 24 | 48 |
| `fake-button` | `div` fazendo papel de botão | 13 | 0 | 4 |
| `obsolete-tags` | tags HTML obsoletas | 12 | 2 | 4 |

Custo total da LLM em todo o trabalho: **US$ 0,07** (`data/processed/llm-runs.csv`).

**Como explicar o ρ (Spearman) em uma frase:** "mede se duas coisas tendem a subir
juntas (perto de 1), em sentidos opostos (perto de −1) ou se não têm relação (perto de
0)".

---

## 6. Resultados da validação (antes/depois)

### Como apresentar de forma simples
Para cada medida, conte **quantos sites melhoraram, quantos pioraram e quantos ficaram
iguais**, e dê a **mediana da diferença**. O teste estatístico entra em uma frase, como
respaldo:

> "Para saber se a melhora não foi por acaso, usamos o teste de Wilcoxon, que compara
> o antes e o depois de cada site. Como foram testadas 5 medidas, aplicamos a correção
> de Holm, que deixa o critério mais rigoroso para evitar falsos positivos."

Leitura do resultado: se o valor-p corrigido (`p_holm`) fica abaixo de 0,05, a
diferença é considerada confirmada. Acima disso, a diferença pode ter sido sorte. Isso
não prova que a correção não funciona: com poucos sites, o teste tem pouca força para
detectar efeitos pequenos.

**Cuidado com o ruído do Lighthouse:** num site isolado, a nota pode variar vários
pontos entre uma medição e outra, mesmo sem nenhuma mudança na página. Por exemplo, no
`ce.ufrn.br` a cópia original variou entre 29 e 48 na rodada v1.0. Por isso, o texto
não deve interpretar a diferença de um site sozinho, e sim o conjunto.

### v1.0, o resultado principal (12 sites)
(`docs/resultados/tabelas/validacao-wilcoxon.csv`)

| Medida | Melhorou | Piorou | Igual | Mediana da diferença |
|---|---:|---:|---:|---|
| Nota de performance | 5 | 2 | 5 | 0 ponto |
| LCP (tempo do maior elemento) | 8 | 4 | 0 | −8 ms (quase nada) |
| CLS (página pulando) | 4 | 1 | 7 | 0 |
| TBT (página travada) | 6 | 5 | 1 | quase 0 |
| Índice de semântica | 6 | 1 | 5 | +2,6 pontos |

Nenhuma diferença foi confirmada pelo teste depois da correção de Holm. O índice de
semântica foi o que mais se aproximou: p = 0,031 sem a correção e 0,156 com ela.

**Achado importante para o texto:** a correção automática de largura e altura das
imagens distorceu imagens em 4 dos 12 sites, e a nota de boas práticas caiu de 3 a 4
pontos nesses sites. Isso mostra que uma correção automática que ignora o CSS da página
pode piorar o resultado (ADR 004).

### S18b, as regras revistas (mesmos 12 sites, análise posterior)
(`docs/resultados/tabelas/validacao-wilcoxon-posterior.csv`)

| Medida | Melhorou | Piorou | Igual | Mediana da diferença |
|---|---:|---:|---:|---|
| Nota de performance | 4 | 1 | 7 | 0 ponto |
| LCP | 10 | 2 | 0 | −0,29 s |
| CLS | 3 | 2 | 7 | 0 |
| TBT | 8 | 3 | 1 | −11,6 ms |
| Índice de semântica | 7 | 1 | 4 | +5,3 pontos |

- Nenhuma imagem distorcida.
- A LLM corrigiu 3 sites; eram 1 na v1.0.
- Ainda nada confirmado depois de Holm: LCP p = 0,027 → 0,107; índice p = 0,016 → 0,078.

Deve ser apresentada como "o que mudou depois de corrigirmos as regras", e não como o
resultado principal, porque as regras foram mudadas depois de ver a v1.0.

### Censo, todos os elegíveis (134 sites, análise secundária)
(`data/processed/validation-censo.csv`, seção 6 do `analysis/validacao.ipynb`,
pré-registro no adendo do censo ao ADR 004)

- **Por que existe:** com só 12 sites, os testes têm pouca força, e os 12 piores não
  representam o conjunto. O censo mede todos os sites que recebem ao menos uma correção
  automática.
- **Quem ficou de fora:** 14 páginas que não são portais públicos, conferidas pela foto
  da tela antes de medir: telas de login, documentação de API, painel de robô,
  listagem de pastas, página "em construção" e página de erro.
- **O que foi feito:** 2.424 correções automáticas, com mediana de 7 por site. A LLM trocou
  landmarks em 46 sites (77 trocas). Medição em 2026-11-16, sem nenhum site perdido.

| Medida | Melhorou | Piorou | Igual | Mediana antes → depois | Confirmado pelo teste? |
|---|---:|---:|---:|---|---|
| Nota de performance | 52 | 20 | 62 | 65,5 → 68 | **sim** (p corrigido = 0,020) |
| LCP (tempo do maior elemento) | 106 | 28 | 0 | 9,6 s → 9,0 s (diferença mediana −0,44 s) | **sim** (p < 0,001) |
| CLS (página pulando) | 28 | 22 | 84 | quase 0 nos dois | não |
| TBT (página travada) | 56 | 42 | 36 | 38,5 → 36 ms | não |
| Índice de semântica | 63 | 2 | 69 | 64,6 → 70,8 | **sim** (p < 0,001) |

(`docs/resultados/tabelas/validacao-wilcoxon-censo.csv`)

**Frases simples para o texto:**
- "Com todos os 134 sites, as correções automáticas melhoraram de forma confirmada a nota
  de performance, o tempo de carregamento do maior elemento (LCP) e o índice de
  semântica."
- "O LCP melhorou em 106 dos 134 sites. Em 64 deles, a melhora passou de meio segundo."
- "O índice de semântica subiu em 63 sites e caiu em só 2. Entre os que mudaram, a
  subida mediana foi de 6,3 pontos. Nos outros 69, as correções foram só de
  performance, então o índice não tinha por que mudar."
- "A nota de acessibilidade do Lighthouse melhorou em 52 sites e não piorou em nenhum. A
  de boas práticas não piorou em nenhum site: a distorção de imagens da v1.0 não voltou."

**Melhorou ou foi sorte? (a faixa de ruído).** Cada versão foi medida 3 vezes, e a
diferença entre a maior e a menor nota é a variação natural do site. Comparando a
diferença de nota com essa variação:
- **19 sites** melhoraram mais do que a variação natural;
- **4 sites** pioraram mais do que a variação natural;
- **111 sites** ficaram dentro da variação natural, ou seja, sem diferença perceptível
  num site isolado.

O teste estatístico enxerga o que um site sozinho não mostra: somando todos, as
melhoras foram bem mais frequentes que as pioras (52 contra 20).

**Pioras reais (achado para a discussão).** Em 8 sites, a página passou a "pular" mais
(CLS subiu mais de 0,05), e em alguns a nota caiu bastante, como `negtec` (−21),
`direitoacidade` (−16) e `nesc` (−13). Há duas causas, ambas encontradas nos relatórios
do Lighthouse:
1. **Carregamento tardio (`img-lazy`) em imagens sem largura e altura.** A imagem chega
   depois e empurra o conteúdo. Acontece quando a proteção de imagens desfaz a correção
   de dimensões, mas o carregamento tardio continua. É uma interação entre duas regras
   (`transportes`, `covid19`, `direitoacidade`, `negtec`).
2. **Inserção da `meta viewport`** em páginas que não a tinham. A página passa a se
   adaptar ao celular, e o novo layout se rearranja durante o carregamento (`nesc`,
   `dep.ct`, `negtec`).

Mensagem para o texto: as correções automáticas ajudam na maioria dos sites, mas regras
que parecem seguras isoladamente podem piorar a página quando combinadas, ou quando o
CSS da página não foi feito para elas. Isso reforça a conclusão da v1.0 sobre a
distorção de imagens.

**Semântica que caiu (2 sites).** No `grafica.cchla`, a LLM marcou como conteúdo
principal (`<main>`) um bloco que também contém o cabeçalho e o rodapé. Dentro do
`<main>`, eles deixam de contar como cabeçalho e rodapé da página, e a nota de landmarks
caiu 25 pontos. A própria resposta do modelo dizia que a proposta "não é válida como
main", mas ele a enviou mesmo assim, e o código não tinha como barrar isso. Bom exemplo
para a discussão: a checagem automática conferiu o texto e o CSS, mas não a coerência
da resposta. No `profletras`, a queda foi de 0,04 ponto, desprezível.

**Lembrete:** é análise **secundária**. O resultado principal continua sendo a v1.0, com
12 sites. Uma forma simples de escrever: "na amostra pequena, nenhuma diferença foi
confirmada; ampliando para todos os sites elegíveis, a melhora em performance, LCP e
semântica ficou clara".

---

## 7. Limitações (para a seção "Ameaças à validade")

- Só a página inicial, vista de fora da rede da UFRN (ADR 001 e 005).
- O Lighthouse varia entre medições. Usar a mediana de 3 reduz, mas não elimina, o efeito.
  No corpus, 27 sites variaram 10 pontos ou mais entre as 3 medições (diário da S08).
- Os pesos do índice de semântica são escolha do autor. O índice com pesos iguais dá
  rankings quase idênticos (ADR 003).
- A classificação dos sites por tipo e tecnologia não foi conferida à mão (ADR 005).
- A amostra principal da validação é pequena (12) e escolhida de propósito, entre os
  piores (ADR 004). O censo amplia, mas é análise secundária.
- As notas das cópias locais não são as do site real. Só a diferença entre original e
  corrigido tem sentido (ADR 018).
- A LLM pode dar respostas diferentes para a mesma entrada, e a qualidade das escolhas
  dela não foi avaliada por pessoas (ADR 016).
- O sistema não audita a conformidade completa com a WCAG: trata só os problemas que as
  regras cobrem.

---

## 8. Onde está cada coisa (para citar no texto)

| Preciso de... | Arquivo |
|---|---|
| Por que uma decisão foi tomada | `docs/decisoes/NNN-*.md` (ADRs) |
| O que foi feito em cada sessão, com datas | `docs/diario/` |
| Tabelas e figuras prontas | `docs/resultados/tabelas/` e `docs/resultados/figuras/` |
| Dados por site (uma linha cada) | `data/processed/dataset.csv` |
| Antes/depois por site | `data/processed/validation-v1.0.csv`, `validation.csv`, `validation-censo.csv` |
| Lista e descrição das 9 regras | `docs/artigo/catalogo-regras.md` |
| Uso de IA no trabalho (declaração) | `docs/artigo/declaracao-uso-ia.md` |
| Ligação entre objetivos, evidências e seções | `docs/artigo/rastreabilidade.md` |
| Versões das ferramentas e hashes dos dados | `docs/ambiente/` |
| Como reproduzir tudo | `README.md`, seção "Como reproduzir" |
| Os prompts enviados à LLM | `docs/prompts/` |

### Pontos a conferir antes do texto final
- As referências citadas de memória nos ADRs, como WCAG, eMAG e WebAIM, precisam ser
  conferidas na fonte (pendência registrada no `docs/STATUS.md`).
- A origem da lista de 1.290 endereços (`data/input/registros-ufrn.txt`) precisa ser
  descrita no texto. Os documentos consultados para este guia não dizem de onde ela
  veio.
- Os ADRs ainda estão como "proposto": precisam ser validados com o orientador.
