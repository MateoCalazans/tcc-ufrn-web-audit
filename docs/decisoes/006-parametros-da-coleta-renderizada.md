# ADR 006 — Parâmetros da coleta renderizada (HTML bruto, DOM, screenshot, HAR)

**Data:** 2026-11-09 · **Status:** proposto

## Contexto
O módulo 1 (coleta) grava, para cada site incluído no corpus, o HTML bruto e a
página renderizada por um navegador (DOM, screenshot, HAR). Esses artefatos são
**imutáveis** depois de coletados (regra 8) e alimentam a análise de semântica
(S10–S12) e a cópia local da validação (S17). Os parâmetros do navegador mudam
o resultado: largura da tela, quando a página "terminou de carregar", o que
fazer com certificado inválido e como as regras éticas (paralelismo, pausa)
se aplicam a um navegador, que baixa dezenas de recursos por página.

## Opções consideradas
1. **Perfil do dispositivo**
   - a) Um dispositivo da lista do Playwright (ex.: Pixel 7) — prós: pronto; contras: difere do Lighthouse da S06.
   - b) **A mesma emulação de tela do Lighthouse mobile** (Moto G Power: 412×823, DPR 1,75, `mobile: true`) — prós: o DOM/screenshot correspondem ao que o Lighthouse mede; contras: precisa ser mantida em sincronia (coberto por teste).
2. **Critério de "página carregada"**
   - a) Evento `load` — rápido, mas perde conteúdo injetado por JS depois do load.
   - b) **`networkidle` (500 ms sem rede) com teto de 30 s; se estourar, grava o estado atual e marca `networkidleTimeout: true`** — captura o DOM final na maioria dos sites sem descartar os que mantêm conexões abertas (chat, analytics, polling).
   - c) Espera fixa (ex.: 10 s) — arbitrária e lenta.
3. **Certificado TLS inválido**
   - a) Sempre ignorar erros de certificado — contras: mascararia problemas fora do critério do ADR 005.
   - b) **Ignorar só nos sites marcados `tls_invalido` na triagem** — coerente com o ADR 005.
4. **Regras 1 e 2 (≤ 2 hosts em paralelo; ≥ 2 s entre requisições ao mesmo host) num navegador**
   - a) Interceptar e espaçar cada sub-recurso — distorce o carregamento (e a página deixaria de ser representativa).
   - b) **As regras valem para as navegações iniciadas pelo pipeline** (o GET bruto e a navegação do navegador passam pelo `HostLimiter`); os sub-recursos baixados pelo navegador fazem parte do carregamento normal de uma visita, como a de qualquer usuário. Sites renderizados **um de cada vez**.
5. **`robots.txt`**
   - a) Reconsultar antes da coleta — mais uma requisição por site.
   - b) **Confiar na triagem** (ADR 002), que já excluiu os sites com `robots` — a coleta acontece dias depois da triagem.
6. **User-Agent do navegador**
   - a) User-Agent móvel do Lighthouse — contras: viola a regra 2 (cliente não identificado).
   - b) **O nosso User-Agent identificado** em todas as requisições do navegador.
7. **Conteúdo do HAR**
   - a) Só metadados (`content: omit`) — leve, mas a cópia local da S17 teria de baixar os recursos de novo.
   - b) **Corpos embutidos (`content: embed`)** — HAR mais pesado, mas a página fica arquivada inteira no momento da coleta.

## Decisão
1b, 2b, 3b, 4b, 5b, 6b, 7b. URL coletada = `url_final` do `corpus.csv`.
Artefatos por site em `data/raw/<id>/`: `index.html` (bytes exatamente como
recebidos), `rendered.html` (`page.content()` após a espera), `screenshot.png`
(só a viewport), `page.har`, `collect.json` (meta, tempos, status, erros).
Uma pasta já existente com `collect.json` **não é sobrescrita** (regra 8).

## Justificativa
Usar a mesma emulação de tela do Lighthouse faz o DOM analisado na semântica
corresponder à página medida na performance. O `networkidle` com teto é o
critério usual de ferramentas de crawling para páginas com JS, e o teto evita
perder sites "sempre ocupados". As regras éticas existem para não sobrecarregar
os servidores com o *nosso* tráfego automatizado; uma visita de navegador por
site, espaçada, equivale a um acesso humano.

## Consequências
- Positivas: artefatos coerentes com a S06; coleta reprodutível e auditável (HAR completo).
- Negativas / limitações (vão para "Ameaças à validade"):
  - Sites com JS que injeta conteúdo depois de 30 s ficam com DOM incompleto (marcados com `networkidleTimeout`).
  - Servidores que entregam HTML diferente para User-Agent móvel "real" podem diferir do que um celular recebe, pois usamos o nosso User-Agent.
  - O HTML bruto e o renderizado vêm de duas requisições distintas (alguns segundos de diferença); páginas dinâmicas podem diferir entre elas.
  - Coleta feita de fora da rede da UFRN (mesma ressalva do ADR 005).

## Onde aparece no TCC
Metodologia → Coleta de dados (parâmetros do navegador); Ameaças à validade.
