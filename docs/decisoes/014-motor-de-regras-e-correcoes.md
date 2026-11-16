# ADR 014 — Motor de regras e correções automáticas

**Data:** 2026-11-12 · **Status:** proposto

## Contexto
O módulo 3 gera recomendações por site e, quando possível, uma cópia corrigida do HTML
(`fixed.html`) e o diff unificado (`fix.diff`). A cópia corrigida é o insumo da
validação (S17–S18): original local × corrigido local (regra 7). Por isso é preciso
decidir sobre qual HTML as regras agem, como a correção é aplicada e o que cada uma
das 3 primeiras regras (`html-lang`, `meta-viewport`, `img-dimensions`) corrige
sozinha e o que só recomenda.

## Opções consideradas
1. **HTML de entrada: `index.html` (bytes da resposta HTTP) × `rendered.html` (DOM serializado).**
   - Bruto: é o que um servidor estático consegue servir na validação, e é o que o
     mantenedor do site edita. Contra: não vê o que o JavaScript injeta.
   - Renderizado: reflete a página que o usuário vê, e a análise semântica (ADR 010)
     usa ele. Contra: servir o DOM serializado faria o JS rodar de novo sobre a página já
     montada, e o diff não corresponderia a nenhum arquivo do site.
2. **Aplicação da correção: reserializar o documento (cheerio `.html()`) × editar o texto nas posições de origem.**
   - Reserializar: simples. Contra: muda aspas, espaços e entidades da página inteira. O
     diff fica ilegível e a validação passaria a medir também mudanças não intencionais.
   - Editar nas posições (`sourceCodeLocationInfo` do parse5): só os bytes da correção
     mudam. Contra: uma regra não corrige tags que o parser inferiu e que não existem no
     arquivo (`<html>`/`<head>` implícitos).
3. **`lang`: valor fixo `pt-BR` × detectar o idioma do texto.** Detectar exigiria uma
   biblioteca ou um modelo, com taxa de erro própria. Os sites são institucionais da
   UFRN, mas não foi verificado se algum está em outro idioma.
4. **Dimensões das imagens: intrínsecas (arquivo baixado, no HAR) × exibidas (layout do Chromium).**
   As intrínsecas definem a proporção que o navegador reserva antes do download, que é o
   objetivo da auditoria `unsized-images` do Lighthouse. As exibidas dependem da largura
   da tela (412 px na coleta, ADR 006) e fixariam um layout móvel no HTML.
5. **Diff: biblioteca `diff` (jsdiff) × implementação própria.** A biblioteca é pequena,
   sem dependências, e produz o formato unificado padrão (`git apply`/`patch`).

## Decisão
- **Entrada:** `data/raw/<site>/index.html`, decodificado como UTF-8 quando é UTF-8
  válido; senão, como latin1. O `fixed.html` é gravado na mesma codificação. Como as
  inserções são ASCII, os bytes fora das correções ficam idênticos. O `page.har`
  (mesma coleta) é contexto opcional.
- **Correção = lista de edições `{inicio, fim, texto}`** sobre o texto original. O motor
  aplica as edições de todas as regras de trás para frente. Se duas edições se
  sobrepõem, vence a da regra que vem antes na ordem fixa, e a outra recomendação fica
  como `correcaoAutomatica: false`, com o motivo na mensagem.
- **`html-lang`:**
  - sem `lang`, ou com `lang` vazio, em um `<html>` explícito → corrige para `lang="pt-BR"`;
  - `lang` com sintaxe inválida (ex.: `pt_BR`) → só recomenda;
  - `lang` válido de outro idioma → recomendação `info` para conferir, sem corrigir.
- **`meta-viewport`:**
  - sem `<meta name="viewport">` → insere `width=device-width, initial-scale=1` logo
    depois da declaração de charset (`<meta charset>` ou `http-equiv="Content-Type"`),
    para não empurrá-la para fora dos 1024 bytes em que o navegador a procura; sem ela,
    depois do `<head>` explícito (ou do `<html>`, se não houver `<head>` no arquivo);
  - meta sem `width=device-width` ou com zoom bloqueado (`user-scalable=no` ou
    `maximum-scale` < 5) → só recomenda.
- **`img-dimensions`:** para `<img>` sem `width` e `height` no atributo nem em
  `style` inline, procura a URL resolvida (respeitando `<base href>`) no HAR, ou decodifica
  uma URI `data:`, e lê as dimensões intrínsecas do cabeçalho do arquivo (PNG, GIF,
  JPEG, WebP; SVG por `width`/`height` absolutos ou `viewBox`). Encontrou → corrige.
  - Só um dos atributos presente → acrescenta o outro na proporção do arquivo.
  - Imagem com carregamento tardio (`data-src`, `data-srcset`, `data-lazy-src`,
    `data-original`) → só recomenda: o `src` costuma ser um *placeholder* 1×1 e a
    correção fixaria a proporção errada.
  - Sem o arquivo no HAR ou formato não reconhecido → só recomenda.
- **Diff:** `diff` 9.0.0 (jsdiff), formato unificado, `a/index.html` → `b/fixed.html`.

## Justificativa
- O bruto é o único HTML que pode ser servido como "original" e "corrigido" pelo
  mesmo servidor estático (regra 7). O diff mínimo mantém a correção auditável pela banca
  e pelo mantenedor do site.
- `pt-BR` fixo: o corpus é de uma universidade brasileira e a regra 3.1.1 da WCAG 2.2
  (Language of Page) pede só que o idioma principal seja determinável. Um `lang` errado
  em um site estrangeiro seria pior do que nenhum; por isso o `lang` já declarado nunca
  é sobrescrito.
- Dimensões intrínsecas: é o que a documentação do Lighthouse (`unsized-images`) e do
  web.dev sobre CLS recomenda (atributos `width`/`height` + CSS `height: auto`).
- **Referências que o autor deve conferir (citadas de memória):** WHATWG HTML, atributo
  `lang` e BCP 47; WCAG 2.2, critério 3.1.1; documentação do Lighthouse para
  `html-has-lang`, `html-lang-valid`, `viewport`, `meta-viewport` e `unsized-images`;
  web.dev, "Optimize Cumulative Layout Shift".

## Consequências
- Positivas: correções mínimas, determinísticas e reversíveis (`fix.diff`). Cada
  recomendação traz evidência (trecho e posição) e diz se foi corrigida.
- Negativas / limitações (vão para "Ameaças à validade"):
  - O que o JavaScript injeta não é visto: uma imagem inserida por JS sem dimensões
    não é recomendada, e uma `<img>` do bruto pode ganhar dimensões que o JS sobrescreveria.
  - CSS externo não é lido: um `img { height: … }` declarado em folha externa pode
    tornar a correção desnecessária. Já um CSS que fixa só a largura, sem `height: auto`,
    pode **distorcer** a imagem com o novo atributo `height`. A comparação de screenshots
    da S18 é o controle.
  - `lang="pt-BR"` pode estar errado em páginas em outro idioma (não verificado).
  - Tags inferidas pelo parser (sem `<html>` ou `<head>` no arquivo) limitam as correções.
  - Sites cujo bruto é um stub de meta refresh (ADR 010) recebem correções no stub, não
    na página de destino.

## Adendo (S18b, 2026-11-16): guarda de renderização na `img-dimensions`
- **Problema.** Na validação da `v1.0` (ADR 004), a regra distorceu imagens em 4 de 12
  sites. Ela acrescentava `width`/`height`. Quando o CSS da página fixa só uma
  dimensão (ex.: `height: 28px` no logo), o atributo passa a valer na outra.
  - Exemplo: o `logoIMD.png` do `espacos-denf` foi exibido com 1572 × 28, quando a
    proporção do arquivo é 4,13.
  - Efeito: `image-aspect-ratio` reprovada e boas práticas −3 a −4.
- **Decisão do autor:** corrigir, sem poder quebrar imagens (*"nao pode quebrar
  imagens"*, *"alguma solucao a prova de erros"*).
- **Opções:**
  - a) Ler o CSS da página e só corrigir se nenhuma regra dimensiona a imagem.
    Contras: media queries, especificidade e scripts tornam a análise estática
    incompleta. Não é à prova de erro.
  - b) Acrescentar `height: auto` inline. Contras: quebra quando o CSS fixa a altura.
  - c) **Medir no navegador (escolhida).** O módulo 3 renderiza a página original e a
    corrigida a partir do `page.har` (sem rede, regra 7), em viewport mobile (o da
    coleta) e desktop (1350 × 940). Mede o tamanho de layout
    (`offsetWidth` × `offsetHeight`) de cada imagem corrigida.
- **Regra de decisão.** A correção de uma imagem só fica se o tamanho for igual
  (tolerância de 0,5 px) nos dois viewports. É desfeita, e vira só recomendação, se:
  - o tamanho muda;
  - o original varia entre duas renderizações;
  - a imagem não carrega ou não é encontrada (ex.: removida por script);
  - falta o HAR ou a renderização falha.

  Sem prova de que o tamanho não muda, não corrige.
- **Detalhes de medição.**
  - Um marcador (`data-tcc-guarda`) identifica as imagens. Ele existe só no HTML de
    medição, nunca no `fixed.html`.
  - Imagens com `loading` passam a carregar de imediato nas duas variantes, porque
    imagens tardias fora da tela não carregariam e ficariam sem medida.
  - Requisições que falharam na coleta (status −1 no HAR, ex.: `ERR_BLOCKED_BY_ORB`)
    são abortadas, como na coleta. Sem isso, o `routeFromHAR` do Playwright ficava
    pendurado numa folha do Google Fonts do `ce.ufrn.br`, e a guarda desfazia as 11
    correções por tempo esgotado.
  - A navegação espera o `domcontentloaded` e, por no máximo 15 s, o `load`. Isso
    não afrouxa a guarda, porque cada imagem só é julgada se tiver carregado.
- **Registro.** `recommendations.json` → `guardaImagens`, com os vereditos e as
  medidas por imagem e viewport. O código está em `src/recommend/guarda-imagens.ts`.
- **Limitações:**
  - só dois viewports (outros tamanhos de tela não são provados);
  - o estado medido é o do carregamento, sem interação;
  - a guarda roda um navegador no módulo 3, cerca de 10 s por site com imagem
    corrigida.

## Onde aparece no TCC
Metodologia, módulo de recomendação (Cap. 5): motor, formato da correção, regras.
Ameaças à validade: bruto × renderizado, CSS externo, `lang` fixo.
