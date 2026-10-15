# ADR 002 — Critérios de inclusão e exclusão do corpus

**Data:** 2026-10-15 · **Status:** proposto

## Contexto
A lista `registros-ufrn.txt` (1.290 linhas) mistura sites, sistemas, infraestrutura
e ambientes de teste. Precisamos de critérios objetivos e reprodutíveis.

## Decisão
**Incluir** se: responde HTTP 200 (após redirects) com `Content-Type: text/html`;
conteúdo público, sem login; `robots.txt` não proíbe a página inicial.

**Excluir**, registrando o motivo (`motivo_exclusao` no corpus.csv):
| Código | Critério |
|---|---|
| `infra` | hostname de infraestrutura/teste (dns, ldap, mta, api, hml, homolog, teste, staging, grafana, portainer…) |
| `dns` | DNS não resolve |
| `timeout` | sem resposta em 15 s |
| `http-4xx` / `http-5xx` | erro HTTP |
| `nao-html` | Content-Type não é HTML |
| `login` | sistemas com autenticação (SIGAA, SIPAC, SIGRH e afins) |
| `pagina-padrao` | "It works!", página padrão Apache/Nginx |
| `duplicata` | redireciona para domínio já incluído |
| `robots` | robots.txt proíbe |

**Corrigir** (não excluir): domínios malformados como `www.cbeqimat.ufrn.br.ufrn.br`.

## Consequências
- O funil de triagem (com contagem por motivo) entra como tabela na Metodologia.
- Sites fora do ar no dia da triagem ficam de fora — registrar a data.

## Onde aparece no TCC
Metodologia (construção do corpus).
