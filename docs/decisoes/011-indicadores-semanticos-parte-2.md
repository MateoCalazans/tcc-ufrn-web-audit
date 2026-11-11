# ADR 011 — Indicadores semânticos, parte 2 (estrutura, interativos, metadados, alt, label, obsoletos, vnu)

**Data:** 2026-11-10 · **Status:** proposto

## Contexto
A S11 completa os indicadores de semântica HTML em `src/analyze/semantics.ts`,
também sobre o `rendered.html`. Valem as regras do ADR 010: análise estática,
sem CSS computado; só o atributo `hidden` tira elementos (e o que estiver dentro)
das contagens; `script`/`style`/`template`/`noscript` e o interior de
`svg`/`math` são ignorados. O roteiro pede: (4) estrutura, (5) interativos
falsos, (6) metadados, (7) `img` sem `alt`, (8) `input` sem `label`, (9) tags
obsoletas e tabela de layout por heurística, com o vnu opcional atrás de uma
flag. Em cada item há escolhas que mudam os números.

## Opções consideradas e decisão
1. **Estrutura (4).** Contar `article`, `section`, `aside`, `figure`, `ul` e
   `ol` **pela tag**, sem considerar `role` (`<div role="article">` não conta).
   O indicador mede o uso dos elementos do HTML, e não a semântica exposta.
   Alternativa descartada: somar os `role` equivalentes, o que misturaria
   indicador de HTML com indicador de ARIA (os landmarks do ADR 010 já fazem isso).
2. **Interativos falsos (5).** `div`/`span` com o atributo `onclick` que **não
   têm `role` (não vazio) nem `tabindex`**. Se tiver um dos dois, não conta.
   Também se registra o total de `div`/`span` com `onclick`. Limitação: os
   handlers ligados por `addEventListener` (jQuery, frameworks) não aparecem no
   DOM serializado, então o indicador é um **limite inferior**.
3. **Metadados (6).**
   - `lang`: valor de `<html lang>` sem espaços nas pontas; ausente ou vazio →
     `null`. O código **não é validado** contra a BCP 47 (ex.: `pt_BR`, com
     sublinhado, conta como presente). O valor bruto fica registrado.
   - `title`: o primeiro `<title>` fora de `svg` precisa ter texto (espaços
     normalizados). O comprimento também é registrado.
   - `meta viewport` e `meta description`: `name` sem diferenciar maiúsculas e
     `content` não vazio.
4. **`img` sem `alt` (7).** A falha é só a **ausência do atributo `alt`**.
   `alt=""` (ou só espaços) indica imagem decorativa e não é falha (WCAG 2.2,
   técnica H67). Registram-se à parte: o total de `img`, os com `alt` vazio e,
   entre os sem `alt`, os que têm `aria-label`, `aria-labelledby` ou `role`
   `presentation`/`none` (para uma análise de sensibilidade; a axe-core aceita
   essas alternativas).
5. **`input` sem `label` (8).**
   - Entram os `input`, menos os tipos `hidden`, `submit`, `button`, `image` e
     `reset` (que têm rótulo próprio ou não são expostos). Tipo ausente ou
     desconhecido = `text`. `select` e `textarea` **ficam fora**, porque o
     roteiro pede `input`.
   - Rótulo válido: `<label for>` que aponta para o `id` do campo (o **primeiro**
     elemento com aquele `id`, como faz o `getElementById`), `label` ancestral,
     `aria-label` não vazio ou `aria-labelledby` com **ao menos um `id` que
     exista** no documento.
   - `placeholder` e `title` **não** valem como rótulo (WCAG 2.2, critérios
     1.3.1 e 3.3.2; o `placeholder` some quando se digita). Entre os sem
     rótulo, os que têm `placeholder` ou `title` são contados à parte.
6. **Elementos obsoletos (9a).** O indicador principal é o do roteiro:
   `font` + `center` + `marquee`. À parte, conta-se toda a lista de elementos
   que o WHATWG HTML Living Standard (§16.2, "Non-conforming features") proíbe
   aos autores: `applet`, `acronym`, `bgsound`, `dir`, `frame`, `frameset`,
   `noframes`, `isindex`, `keygen`, `listing`, `menuitem`, `nextid`, `noembed`,
   `param`, `plaintext`, `rb`, `rtc`, `strike`, `xmp`, `basefont`, `big`,
   `blink`, `center`, `font`, `marquee`, `multicol`, `nobr`, `spacer`, `tt`
   (lista conferida na página do WHATWG em 2026-11-10). Atributos obsoletos
   (`align`, `bgcolor`…) ficam fora. Só se percorre o `body`. Nenhum
   `rendered.html` do corpus tem `frameset`, verificado com `grep`.
7. **Tabela de layout (9b), heurística.** Cada `table` visível, inclusive as
   aninhadas, recebe uma classe. As regras são aplicadas em ordem, e a primeira
   que vale decide:
   1. `role="presentation"` ou `"none"` → **layout declarada** (o autor diz que
      é de layout);
   2. `role` `table`, `grid` ou `treegrid` → **dados**;
   3. `th`, `caption` ou `thead` **da própria tabela** (não de uma aninhada)
      → **dados**;
   4. contém outra `table`, **ou** tem `div`, `p` ou `form` dentro das células
      → **layout (heurística)**;
   5. senão → **indeterminada** (tabela simples de texto, sem cabeçalho: pode
      ser de dados mal marcada ou de layout).

   O indicador de layout é `layoutDeclarada + layoutHeuristica`; as cinco
   contagens ficam no dataset. A heurística segue a ideia das técnicas F46 e
   H51 do WCAG e dos critérios das ferramentas de avaliação (marcação de
   cabeçalho indica dados; aninhamento e conteúdo de bloco indicam layout), mas
   é uma operacionalização deste trabalho. Alternativas descartadas: usar
   atributos de apresentação (`width`, `cellpadding`, `border="0"`), que
   também aparecem em tabelas de dados antigas; e usar o tamanho da tabela,
   que pede CSS computado.
8. **Validação HTML com vnu (opcional).** Atrás da flag `--vnu`; o caminho do
   `vnu.jar` vem de `--vnu-jar <arquivo>` ou da variável `VNU_JAR`, e o `.jar`
   **não** é dependência do projeto. O README do validator/validator exige
   **Java 17 ou mais novo**. A máquina da S11 tem Java 1.8.0_481
   (`java -version`). Por isso:
   - o adaptador (`src/analyze/vnu.ts`) verifica o Java e o `.jar` uma vez por
     lote; se não servirem, cada site recebe
     `{ status: "indisponivel", motivo }` e a análise segue;
   - com Java compatível, roda `java -jar vnu.jar --format json --stdout
     <rendered.html>` e conta `error` e `info/warning`. O código de saída 1
     (há erros) não é falha de execução;
   - o adaptador foi testado com um `java` simulado. **A execução real não foi
     feita** e fica cortada por enquanto (o roteiro marca o vnu como
     cortável). Ela pode ser feita depois sem mudar código, instalando o Java
     17 e baixando o `vnu.jar`.

## Decisão
Itens 1–8 como acima. Definições centrais aprovadas pelo autor no plano da S11
(*"aprovado"*): `alt=""` válido, `placeholder`/`title` não aceitos como
rótulo, a heurística de tabela e o vnu atrás da flag com registro de
indisponibilidade.

Detalhes acrescentados durante a implementação, sem nova consulta:
- `role` vazio conta como sem `role` (item 2);
- o `label for` só vale para o primeiro elemento com aquele `id`, e o
  `aria-labelledby` só vale se um dos `id` existir (item 5);
- `select`/`textarea` fora (item 5);
- a lista completa do WHATWG como contagem à parte (item 6), já que o plano
  deixava isso a critério do autor;
- as contagens de sensibilidade (`semAltComAlternativa`,
  `semLabelComPlaceholderOuTitle`);
- `role` `grid`/`treegrid` como dados, e a ordem das regras da heurística
  (item 7).

## Justificativa
- WCAG 2.2: 1.1.1 (alternativa em texto), 1.3.1 (informação e relações),
  2.1.1 (teclado: o interativo falso não recebe foco), 3.1.1 (idioma da
  página), 2.4.2 (título da página), 3.3.2 (rótulos ou instruções). eMAG 3.1:
  recomendações 3.1 (idioma), 3.6 (alternativa em imagens) e 6.2 (rótulos em
  formulários). WHATWG §16.2 para os elementos obsoletos.
- Como no ADR 010, as normas definem critérios, e não métricas. As contagens
  acima são operacionalizações deste trabalho, e por isso os brutos e as
  variantes de sensibilidade ficam no dataset (regra 9).

## Consequências
- Positivas: os 9 indicadores do roteiro estão implementados, com testes por
  indicador; as variantes de sensibilidade permitem responder a "e se aceitasse
  `placeholder`?" sem recodificar.
- Negativas / limitações (vão para "Ameaças à validade"):
  - interativos falsos é limite inferior (handlers por JS não aparecem);
  - `lang` não é validado (BCP 47);
  - a heurística de tabela não foi validada manualmente em amostra; a classe
    `indeterminada` é ambígua por construção;
  - sem validação HTML (vnu) na coleta atual, por falta de Java 17;
  - mesmas limitações do ADR 010 (sem CSS computado, stubs de meta refresh).

## Onde aparece no TCC
Metodologia (indicadores de semântica, base do índice do ADR 003/S12) e
Ameaças à validade.
