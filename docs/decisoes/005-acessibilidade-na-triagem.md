# ADR 005 — O que conta como "acessível" na triagem (certificados, rede de origem, validação da classificação)

**Data:** 2026-11-09 · **Status:** proposto (complementa o ADR 002; aguarda o orientador)

> Numeração: os ADRs 003 (índice de semântica) e 004 (amostra da validação) estão
> reservados pelo `docs/ROTEIRO.md`.

## Contexto
A sondagem completa de 2026-11-04 (S04, `npm run triage -- --probe`) excluiu
**522 de 1.050** hosts como `timeout`. O autor conseguiu abrir no navegador vários
desses sites. O diagnóstico, que registra a causa exata de cada falha (`describeFetchError`
em `src/triage/probe.ts`), mostrou que o código `timeout` do ADR 002 juntava situações
diferentes:

- **Certificado TLS inválido:** expirado, cadeia incompleta ou nome divergente. O
  servidor responde e o navegador deixa o usuário seguir após um aviso, mas o cliente
  Node recusava a conexão.
- **Conexão não aceita a partir da rede de onde a triagem foi rodada** (`connect-timeout`
  em https e http). Os demais hosts da mesma faixa de IP da UFRN respondiam
  normalmente, logo não houve bloqueio do nosso IP.
- **Servidor recusa o nosso cliente:** derruba a conexão (`conexao-fechada`) ou
  responde 403, o que sugere um filtro contra clientes que não são navegadores.
- **Redirect para um host inexistente:** 37 sites `*.ct.ufrn.br` redirecionam para
  `api-boreas.ct.ufrn.br`, que não existe no DNS.

Além disso, o roteiro previa revisar manualmente cerca de 30 classificações de
tipo/tecnologia para medir a taxa de acerto da heurística (`src/triage/classify.ts`).

## Opções consideradas
1. **Certificado inválido → excluir** (critério estrito de "site funcionando").
   Prós: simples. Contras: exclui conteúdo público que qualquer visitante acessa,
   e mistura "fora do ar" com "mal configurado".
2. **Certificado inválido → incluir com marcação** (`tls_invalido`). Prós: reflete o
   acesso real do visitante, e o próprio problema de TLS vira um dado. Contras: o
   Lighthouse precisa ignorar erros de certificado nesses sites.
3. **Rede da triagem:** sondar de fora da UFRN (visão do público externo) ou de
   dentro (visão da comunidade acadêmica).
4. **Contornar o filtro de cliente** trocando o User-Agent por um de navegador:
   **descartada**, porque viola a regra 2 do projeto (User-Agent identificado).

## Decisão
- **Certificado inválido não exclui (opção 2).** O site é lido sem verificar o
  certificado, uma única vez e só para a página inicial, e a causa fica registrada em
  `tls_invalido` no `corpus.csv`.
- **A triagem oficial é a rodada feita de fora da rede da UFRN** (conexão doméstica),
  em 2026-11-04, com uma ressondagem dos excluídos por `timeout` (`npm run triage --
  --retry timeout`). Hosts que não aceitam conexão dessa rede ficam excluídos como
  `timeout`, e o `detalhe` registra a causa (`connect-timeout`, `conexao-fechada`…).
  "Público" passa a significar **acessível a um visitante externo**.
- **403 e conexão derrubada para o nosso User-Agent continuam excluídos** (`4xx` /
  `timeout`). A liberação do User-Agent pode ser pedida à STI/SINFO; nunca se
  disfarça o cliente.
- **A classificação de tipo e tecnologia não foi validada manualmente.** Por decisão
  do autor (2026-11-09), a revisão da amostra de 30 sites não foi feita, e a heurística
  é usada como está.

## Justificativa
- Um visitante comum acessa sites com certificado inválido depois de um aviso.
  Excluí-los subestimaria o corpus justamente nos sites mais mal mantidos, que
  interessam ao diagnóstico.
- Sondar de fora da UFRN corresponde à perspectiva do cidadão, que é o público de um
  portal institucional. É também a condição reproduzível por qualquer pesquisador.
- A regra de User-Agent identificado é um compromisso ético do projeto (CLAUDE.md,
  regra 2) e não é negociável para aumentar o corpus.

## Consequências
- Positivas:
  - **53 sites recuperados** na ressondagem (52 com certificado inválido). Corpus
    final de **242 incluídos**.
  - Cada exclusão tem a causa auditável no `probed.csv`.
- Negativas / limitações (vão para "Ameaças à validade"):
  - **380 hosts** que talvez sejam acessíveis de dentro da UFRN ficaram de fora, por
    isso o corpus representa a visão externa.
  - **Taxa de acerto da classificação não medida.** As contagens por tipo e
    tecnologia devem ser apresentadas como resultado de uma heurística não validada.
    `outro` responde por 75% dos incluídos (182/242).
  - **Páginas placeholder permanecem no corpus.** "Site em construção", "Página de
    teste", "Página não existe" e documentação de API aparecem pelo **título** em 5
    dos 30 sites da amostra de revisão (`docs/resultados/revisao-classificacao.csv`).
    Não foram verificados no navegador. Elas podem rebaixar as
    médias de semântica e performance.
  - A S06 (Lighthouse) precisa de `--ignore-certificate-errors` para os sites com
    `tls_invalido`.

## Onde aparece no TCC
Metodologia (construção do corpus: critérios e rede de origem); Ameaças à validade
(visão externa, classificação não validada, placeholders).
