# ADR 018 — Cópia local servível: fonte, reescrita de URLs e verificação

**Data:** 2026-11-16 · **Status:** proposto

## Contexto
A validação (módulo 4) compara a página original com a página corrigida pelo módulo 3. A
regra 7 do projeto proíbe comparar o site ao vivo com a cópia corrigida: as duas versões
precisam ser **cópias locais**, servidas pelo mesmo servidor e medidas com o mesmo
throttling. A S18 roda o Lighthouse 3× em cada variante, e o Lighthouse abre um Chrome
próprio. Por isso, as cópias precisam estar em disco e ser servidas por HTTP, não só
interceptadas pelo Playwright, como na S16 (`routeFromHAR`).

O roteiro previa *"salvar a página com recursos (Playwright, reescrita de URLs para
caminhos locais)"*, o que exigiria visitar os sites de novo.

Levantamento nos 242 `page.har` da coleta de 2026-11-09 (script de leitura fora do repo,
executado na S17):

| | Quantidade |
|---|---|
| Entradas | 10.211 |
| De outro host (CDN, fontes, redes sociais) | 3.951 (39%) |
| Com query string | 2.462 |
| Redirecionamentos (3xx) | 281 |
| Falha de rede na coleta (status −1) | 122, em 32 sites |
| Respostas 2xx sem corpo | 174 |
| Recursos de texto com `U+FFFD` (texto corrompido) | 66, em 56 sites |

No `index.html` bruto, 34 sites têm `<base href>`, 12 têm `integrity` (SRI) e 20 servem a
página fora da raiz (ex.: `/portal/`). 2 sites não têm `index.html`.

## Opções consideradas
1. **Fonte da cópia.**
   - *Nova captura dos sites ao vivo com o Playwright*, como no roteiro: os recursos podem
     ter mudado desde 09/11, a cópia deixa de corresponder às medições do diagnóstico e o
     método volta a fazer requisições aos servidores da UFRN.
   - *Montar a cópia a partir do `page.har` da coleta congelada*: o HAR foi gravado com
     `content: "embed"` (ADR 006) e já serviu a renderização na S16. Nenhuma requisição
     nova é feita (regras 7 e 8). Em troca, o que não está no HAR não volta.
2. **Como apontar os recursos para o servidor local.**
   - *Proxy HTTP com o HAR*: dispensa reescrever URLs, mas o HTTPS exige interceptação
     TLS com certificado próprio, e o Lighthouse precisaria confiar nele.
   - *Reescrever as URLs para caminhos locais*: só esquema e host mudam
     (`https://h/p?q` → `/p?q` no host principal, `/_ext/h/p?q` nos demais). O servidor
     procura a URL local exata num manifesto.
3. **Escopo da reescrita.** Só o HTML, ou o HTML e todos os recursos de texto (CSS, JS,
   JSON, SVG), inclusive as formas `//h` e `https:\/\/h` (JSON dentro de JS).
4. **Rede externa durante a medição.** Deixar o navegador acessar a internet, ou bloquear
   tudo que não seja `127.0.0.1`.

## Decisão
1. **A cópia é montada a partir do `page.har` da coleta**, e o HTML da página vem do
   `index.html` (original) ou do `fixed.html` (corrigido). O documento que está no HAR não
   é usado.
2. **Reescrita só de esquema e host**, aplicada ao HTML e a todo recurso de texto, nas
   formas `https://h`, `http://h`, `//h` e `https:\/\/h`. Hosts que não aparecem no HAR
   (ex.: links para `sigaa.ufrn.br`) não são tocados.
   - A página é servida no mesmo caminho da URL original (`/portal/`), para os caminhos
     relativos funcionarem.
   - Em CSS e HTML de outros hosts, os caminhos relativos à raiz (`url(/x)`,
     `src="/x"`) são ancorados em `/_ext/<host>/x`. O caso foi encontrado na verificação:
     um CSS do Instagram no `meioambiente`.
   - Os atributos `integrity` são removidos, porque a reescrita muda o conteúdo e o hash
     deixaria de bater.
3. **O original e o corrigido passam pela mesma função** (`prepararHtml`). Os bytes são lidos
   como latin1, e por isso a reescrita não altera nenhum byte além das URLs, qualquer que
   seja o charset. Um teste garante que as duas cópias diferem exatamente nas linhas em
   que o `index.html` e o `fixed.html` diferem.
4. **Manifesto** (`snapshot/manifest.json`):
   - cada URL local aponta para um arquivo `arquivos/<sha256>`, com status, `Content-Type`
     e `Location`;
   - por URL, vale a primeira resposta com corpo (2xx antes de 4xx/5xx), senão o primeiro
     redirecionamento;
   - redirecionamentos para a própria URL são descartados.
5. **Servidor único** (`src/validate/server.ts`). O mesmo código serve as duas variantes, em
   portas diferentes:
   - `Cache-Control: no-store`;
   - gzip para tipos de texto, se o cliente aceitar;
   - URL fora do manifesto: resposta 404, registrada como falta;
   - URL com outra query, num caminho com uma só entrada: serve essa entrada e marca como
     aproximada (ex.: query de cache-busting gerada por script).
6. **Rede externa bloqueada** no Chromium (`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE
   127.0.0.1`), na verificação e no Lighthouse da S18. Nada chega aos sites ao vivo, e o
   que a cópia não trouxe falha em vez de ser buscado.
7. **Verificação visual** (`npm run validate -- snapshot --site <id> --verificar`):
   - a cópia original servida localmente é fotografada com os parâmetros da coleta
     (viewport 412×823, DPR 1,75, `networkidle`, só a viewport);
   - o screenshot é comparado pixel a pixel com o `screenshot.png` da coleta;
   - o ruído é a diferença entre 2 capturas locais seguidas;
   - o relógio do navegador é fixado no início da renderização da coleta
     (`clock.setFixedTime(render.startedAt)`, com os timers correndo).

## Justificativa
- A cópia a partir do HAR corresponde ao estado medido no diagnóstico (09/11). Assim, o
  antes/depois da S18 parte dos mesmos bytes que geraram os indicadores, e o método não
  depende de quando a validação é executada.
- Reescrever só esquema e host mantém caminho, query e fragmento, e por isso a chave do
  manifesto é a própria URL pedida pelo navegador. Também pega URLs montadas a partir de
  constantes em JS (ex.: `"https:\/\/host\/api"`).
- Aplicar a mesma transformação às duas variantes faz a diferença medida na S18 vir só das
  correções do módulo 3. A transformação em si, porém, afeta as duas medições da mesma forma:
  todos os recursos vêm do mesmo servidor local, sem DNS, TLS ou CDN. Por isso, as notas
  absolutas da cópia não são comparáveis com as da coleta, só o delta entre as cópias.
- O relógio fixo foi acrescentado depois da 1ª rodada. O `agenda.ect` (SPA) monta a agenda
  pela data do sistema: com o relógio de 16/11, a cópia pedia a agenda de outro dia e
  ficava vazia, 32,8% de pixels diferentes. Com o relógio de 09/11, 0%.

## Resultados da verificação (S17, 8 sites)
Escolha dos sites, não aleatória e feita para cobrir os casos difíceis do levantamento:
- os 3 sites com troca de landmarks da S16 (`gpc.ect`, `lar.ect`, `quimica`);
- o SPA da S16 (`erros.si`);
- o site com mais recursos de outros hosts (`meioambiente`, 221 entradas externas no HAR);
- o 1º em ordem alfabética com `<base href>` (`acessoainformacao`);
- o 2º com `integrity` (`cchla`);
- o 1º com a página fora da raiz (`agenda.ect`, `/agenda/hoje`).

Comando: `npm run validate -- snapshot --site <8 ids> --verificar`, no commit `7b1d3a3` mais
as alterações da S17 ainda não commitadas.

| Site | Recursos | Coleta × local | Ruído local | Faltas | Externas bloqueadas |
|---|---|---|---|---|---|
| gpc.ect | 7 | 0% | 0% | 1 | 0 |
| lar.ect | 9 | 0% | 0% | 0 | 0 |
| quimica | 14 | 0,091% | 0% | 0 | 0 |
| erros.si | 21 | 0% | 0% | 0 | 0 |
| meioambiente | 115 | 0% | 0% | 13 | 6 |
| acessoainformacao | 23 | 24,326% | 22,877% | 0 | 4 |
| cchla | 58 | 0% | 0% | 0 | 0 |
| agenda.ect | 4 | 0% | 0% | 0 | 0 |

- **6 de 8 idênticos** pixel a pixel ao screenshot da coleta.
- **`quimica`:** página de contagem regressiva. A única diferença são os segundos (14 × 17),
  porque o relógio é fixado no início da renderização e o screenshot sai alguns segundos
  depois (inspeção visual).
- **`acessoainformacao`:** carrossel com transição em fade, capturado em fases diferentes. O
  ruído entre 2 capturas locais tem a mesma ordem (22,9%). O conteúdo é o mesmo (inspeção
  visual).
- **Faltas do `gpc.ect`:** o jQuery por `http://`, que já tinha falhado na coleta (conteúdo
  misto).
- **Faltas do `meioambiente`:** URLs que a coleta não baixou ou que são montadas em JS, como
  imagens `.heic` do Instagram com várias queries possíveis e o Google Maps. Nenhuma aparece
  na viewport.

## Consequências
- Positivas:
  - nenhuma requisição nova aos sites;
  - a cópia é reprodutível a partir do `.zip` congelado (`docs/ambiente/hashes.md`);
  - o mesmo servidor e o mesmo bloqueio de rede servem à S18;
  - a verificação registra faltas, URLs aproximadas e requisições externas por site
    (`verificacao.json`).
- Negativas / limitações (vão para "Ameaças à validade"):
  - **O que não está no HAR não volta.** Ficam de fora:
    - recursos que falharam na coleta;
    - requisições que não são GET;
    - `data:`/`blob:`;
    - respostas sem corpo;
    - URLs que dependem de execução diferente da coleta (outra query, outro horário,
      outro tamanho de tela).
  - **Texto corrompido:** o Playwright grava no HAR os recursos de texto decodificados em
    UTF-8. Um CSS/JS em latin1 chega com `U+FFFD` (66 recursos em 56 sites) e é servido
    assim, marcado como `texto-corrompido`. O HTML da página não é afetado, porque vem do
    `index.html` em bytes.
  - **URLs montadas em JS** a partir de pedaços (`"//" + host`) e caminhos relativos à raiz
    dentro de JS de outros hosts não são reescritos. Viram faltas ou externas bloqueadas.
  - **Rede diferente da original:** um só servidor local, HTTP/1.1, sem TLS, sem DNS e
    sem CDN. Afeta original e corrigido igualmente. As notas absolutas não se comparam com
    as da coleta.
  - **Origem diferente** (`http://127.0.0.1:<porta>`): scripts que verificam
    `location.hostname`, cookies e `localStorage` podem se comportar de outro modo. O
    conteúdo misto (`http://` numa página `https://`) não é mais bloqueado, mas esses
    recursos já faltam no HAR.
  - **Relógio:** a verificação fixa o relógio na data da coleta, mas o Lighthouse da S18 roda
    com o relógio real. Páginas que dependem da data podem mostrar conteúdo diferente do
    coletado, o mesmo nas duas variantes.
  - **A verificação usou 8 sites escolhidos a dedo**, não uma amostra aleatória. A
    tolerância "acima do ruído" é por site, sem limiar global.
  - **O gzip uniforme pode diferir da compressão dos servidores originais.**

## Adendo (S18, 2026-11-16): barra dupla e verificação na amostra
- **Defeito corrigido na reescrita.** `https://h//assets/x.css` (barra dupla depois
  do host) virava `//assets/x.css`. O navegador lia isso como URL de protocolo
  relativo, com o host `assets`, e a rede bloqueada barrava o pedido. A página saía
  sem CSS nem JS.
  - Achado no `materialpublic.imd`: 99,9% de diferença para a coleta, com 14
    externas bloqueadas.
  - Agora a reescrita gera `/.//assets/x.css`, que o navegador resolve como o
    caminho `//assets/x.css` no servidor local, igual à chave do manifesto.
  - O padrão aparece em 3 sites do corpus (`ebs.ect`, `maap.nac`,
    `materialpublic.imd`).
  - A medição do `materialpublic` foi refeita com a cópia corrigida.
- **A verificação da S17 foi refeita nos sites da amostra da S18** (pendência da
  S17). Os resultados por site estão no diário da S18. As diferenças acima do
  ruído foram conferidas no screenshot:
  - carrossel em outro slide (`profletras`);
  - fundo animado (`agir`);
  - logo de host interno não trazido (`secacademica`, `http://storage/...`).
- **O relógio fixo pode congelar animações na verificação.** Mesmo com a barra
  dupla corrigida, o `materialpublic` deu 99,96% de diferença: o véu do modal
  "Termo de uso" ficava parado no início e o modal não aparecia. Uma captura do
  mesmo servidor **sem** `setFixedTime` ficou igual à coleta, com o modal aberto.
  O `Date.now()` congelado trava a animação de abertura (Materialize).
  - Na verificação, isso é falso positivo.
  - O Lighthouse roda com o relógio real e não é afetado.
  - A semântica é medida no DOM, onde o modal existe nos dois casos.
  - Fica como limitação da decisão 7: o relógio fixo resolve páginas que dependem
    da data (`agenda.ect`), mas pode travar animações que medem tempo com `Date`.
- **O `run` reaproveita a cópia em dia** (`copiaEmDia`: existe e é mais nova que
  o `fixed.html`). Refazê-la apagava a verificação. Uma mudança no código da cópia
  não invalida esse critério, e por isso a cópia afetada foi refeita à mão.

## Onde aparece no TCC
Metodologia — Validação (cópia local, regra 7); Ameaças à validade (fidelidade da cópia).
