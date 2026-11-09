# ADR 007 — Parâmetros da medição com o Lighthouse

**Data:** 2026-11-09 · **Status:** proposto

## Contexto
A nota de performance (e as de acessibilidade, boas práticas e SEO) de cada site
vem do Lighthouse (regra 6: perfil mobile, 3 execuções por URL, mediana). O
Lighthouse tem vários parâmetros que mudam o resultado e a variação entre
execuções: qual Chrome, como a rede/CPU são limitadas, qual User-Agent, o que
fazer com cache entre execuções e como escolher "a" mediana entre 3 relatórios.
Também é preciso decidir o que medir nos 23 sites cuja página inicial é um
`<meta http-equiv="refresh">` (ver diário S05) e nos 52 com certificado inválido
(ADR 005).

## Opções consideradas
1. **Navegador**
   - a) Chrome instalado na máquina — contras: versão muda com atualizações automáticas e difere do DOM da S05.
   - b) **O Chromium do Playwright** (mesma versão usada no ADR 006), lançado pelo `chrome-launcher` em modo headless.
2. **Limitação de rede/CPU (throttling)**
   - a) `devtools` (limitação aplicada de fato) — mais "real", mas muito mais variável e lenta.
   - b) **`simulate` (Lantern, padrão do Lighthouse e do PageSpeed Insights)** — mede sem limitação e simula a rede/CPU de um celular intermediário; é a configuração de referência e a de menor variação.
3. **User-Agent**
   - a) User-Agent móvel do Lighthouse — contras: viola a regra 2.
   - b) **O nosso User-Agent identificado**, como no ADR 006: no `emulatedUserAgent` do Lighthouse **e** na flag `--user-agent` do Chrome. Só o `emulatedUserAgent` não basta: o teste integrado mostrou que o `robots.txt` buscado pela auditoria de SEO saía com o User-Agent padrão do HeadlessChrome.
4. **Execuções**
   - **3 execuções sequenciais, cada uma com um Chrome novo e um perfil temporário novo** (sem cache, cookies ou service workers da anterior); o Lighthouse também limpa o armazenamento da origem antes de medir (padrão). Cada execução passa pelo `HostLimiter` (≥ 2 s entre inícios no mesmo host). Um site e um Chrome por vez, para uma medição não disputar CPU com outra.
5. **Certificado TLS inválido**
   - **`--ignore-certificate-errors` só nos sites com `tls_invalido`** (coerente com ADR 005 e 006).
6. **Sites com meta refresh**
   - a) **Medir a `url_final` do corpus como ela é** (a mesma URL do `index.html` da S05); o relatório registra `finalDisplayedUrl` e `mainDocumentUrl`, e a análise (S10) decide o tratamento.
   - b) Medir o destino do refresh — contras: a URL medida deixaria de ser a do corpus e do HTML bruto.
7. **Mediana**
   - a) **Execução mediana pela nota de performance** — o relatório escolhido é um relatório real e coerente (todas as métricas vêm da mesma execução) e o critério é simples de explicar, pois a nota é a variável principal do estudo.
   - b) Execução mais próxima da mediana de FCP e TTI (`computeMedianRun`, usado pelo próprio Lighthouse/PageSpeed) — também um relatório real; o projeto Lighthouse evita a nota porque ela pode ter outliers no início/fim do carregamento. Contras: critério menos intuitivo para a banca.
   - c) Mediana métrica a métrica (LCP, TBT, CLS…) — combina valores de execuções diferentes; pode ser calculada na análise (S09) a partir dos 3 arquivos.

## Decisão
1b, 2b, 3b, 4, 5, 6a, 7a. Categorias: performance, accessibility,
best-practices e seo. Arquivos por site em `data/raw/<id>/`: `lh1.json`,
`lh2.json`, `lh3.json` (relatórios completos) e `lighthouse.json` (meta,
parâmetros, notas das 3 execuções, índice da mediana, desvio-padrão e amplitude
da nota de performance). Também é registrado o índice que o `computeMedianRun`
escolheria (opção 7b), para medir a concordância entre os dois critérios.
Uma execução com `runtimeError` (ex.: `NO_FCP`) ou
sem nota de performance é inválida; a mediana é tomada sobre as válidas (com 2
válidas, a de menor nota) e o site só fica `completo` com 3 válidas. Um
`lighthouse.json` existente não é sobrescrito (regra 8).

## Justificativa
O modo `simulate` é o padrão do Lighthouse e do PageSpeed Insights, o que torna
os números comparáveis com a literatura e com o que os gestores dos sites veem.
Um Chrome novo por execução elimina efeito de cache entre as 3 medições
(a variação reportada é a do próprio site + da simulação). Escolher uma
execução inteira, e não combinar métricas, segue a orientação do projeto
Lighthouse sobre variabilidade; a escolha pela nota (e não por FCP/TTI) fica
auditável porque os dois índices são gravados.

## Consequências
- Positivas: medição reprodutível, versões registradas (Lighthouse, Chromium, Node), os 3 relatórios brutos preservados.
- Negativas / limitações (vão para "Ameaças à validade"):
  - Variação entre execuções (medida no piloto da S06 e reportada no diário).
  - O resultado do `simulate` depende da CPU da máquina de coleta (`benchmarkIndex` registrado em cada relatório).
  - O User-Agent não é o de um celular real (mesma ressalva do ADR 006).
  - Nos sites com meta refresh, o Lighthouse segue o redirecionamento: no piloto, o `acervus.ufrn.br` foi medido na página de destino (`finalDisplayedUrl` = `/acervus-publico/`, com aviso em `runWarnings`), e o custo do redirecionamento entra na medição. A nota é da página de destino, enquanto o `index.html` é o stub.
  - Medição feita de fora da rede da UFRN (ADR 005).

## Onde aparece no TCC
Metodologia → Coleta de dados (medição de performance); Ameaças à validade.
