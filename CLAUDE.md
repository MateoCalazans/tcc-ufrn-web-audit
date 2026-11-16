# CLAUDE.md — Contexto do projeto

> Leia este arquivo inteiro no início de toda sessão. Depois leia `docs/ROTEIRO.md`
> (para saber em que sessão estamos) e a entrada mais recente de `docs/diario/`.

## O que é este projeto

TCC 2 (Tecnologia em Análise e Desenvolvimento de Sistemas, UFRN/EAJ). Título provisório:
**"Análise automatizada de performance e semântica HTML em portais institucionais:
um estudo de caso nos sites da UFRN."**

Pergunta de pesquisa: *Qual é o estado de performance e semântica HTML dos sites
públicos da UFRN, e em que medida recomendações geradas automaticamente (regras + LLM)
melhoram essas métricas?*

Este repositório é ao mesmo tempo **software** e **evidência científica**. Tudo o que
é produzido aqui (código, dados, decisões, diário) será citado no texto do TCC e no
artigo. Por isso, reprodutibilidade e registro valem tanto quanto o código funcionar.

## Pipeline (5 módulos, cada um grava em disco)

| # | Módulo | Comando | Entrada | Saída |
|---|--------|---------|---------|-------|
| 0 | Triagem | `npm run triage` | `data/input/registros-ufrn.txt` | `data/corpus.csv` |
| 1 | Coleta | `npm run collect -- --limit N` | `data/corpus.csv` | `data/raw/<site>/` |
| 2 | Análise | `npm run analyze` | `data/raw/` | `data/processed/sites/<site>/metrics.json` (ADR 012), `data/processed/dataset.csv` |
| 3 | Recomendação | `npm run recommend -- --site <id>` | métricas + HTML | `recommendations.json`, `fix.diff`, `fixed.html` |
| 4 | Validação | `npm run validate -- --sample <arquivo>` | original + corrigido | `validation.json` |
| — | Relatórios | `npm run report` | dataset + validações | `reports/` |

Cada módulo é independente: lê só arquivos, nunca chama outro módulo diretamente.

## Stack

- Node.js 20+ com **TypeScript** (ESM, `strict: true`), executado com `tsx`.
- `lighthouse` (API Node) + `chrome-launcher` — performance.
- `playwright` (chromium) — DOM renderizado, screenshot, HAR, axe-core.
- `undici`/`fetch` nativo — HTML bruto.
- `cheerio` (ou `parse5`) — análise de HTML.
- `p-limit` — concorrência.
- `vitest` — testes.
- `@anthropic-ai/sdk` — **apenas** no módulo 3.
- Opcional/cortável: `vnu-jar` (precisa de Java), `axe-core`.
- Estatística e gráficos finais: Python/pandas em `analysis/` (notebooks).

## Regras invioláveis (ética e metodologia)

1. **No máximo 2 hosts em paralelo**; pausa mínima de 2 s entre requisições ao mesmo host.
2. **User-Agent identificado** em toda requisição: `TCC-EAJ-UFRN-Audit/<versão> (+contato no README)`.
3. **Respeitar `robots.txt`.** Se proibir, o site é excluído com motivo `robots`.
4. **Só páginas públicas, sem login.** Nunca enviar formulários, nunca autenticar.
5. **Só a página inicial** de cada site (ADR 001).
6. **Lighthouse: perfil mobile, 3 execuções por URL, usar a mediana.** Registrar versões
   do Lighthouse, Chrome e Node em todo JSON de saída.
7. **Nunca comparar site ao vivo com cópia corrigida.** Validação é sempre
   *cópia local original × cópia local corrigida*, mesmo servidor, mesmo throttling.
8. **Dados brutos são imutáveis.** Nada em `data/raw/` é editado depois de coletado.
   Análises sempre releem os brutos.
9. **Indicadores brutos sempre no dataset**, além do índice composto (a banca pode
   questionar os pesos).
10. Toda saída JSON inclui `meta: { collectedAt | generatedAt, toolVersions, gitCommit }`.

## Convenções de código

- Um arquivo por regra em `src/recommend/rules/`, exportando a interface `Rule`
  (ver `src/shared/types.ts` quando existir).
- Funções de análise **puras** (recebem HTML/JSON, devolvem objeto) — fáceis de testar.
- **Todo analisador e toda regra vem com teste** usando fixtures em `tests/fixtures/`
  (HTML de entrada → resultado esperado). Sem teste, não está pronto.
- Logs estruturados (JSON lines) em `logs/<modulo>-<data>.jsonl`; nada de `console.log` solto.
- Erros por site não derrubam o lote: registrar e seguir.
- Identificador de site (`<site>`): hostname normalizado, sem `www.`, ex.: `ppgsw.ufrn.br`.

## Convenções de Git

- Mensagem: `tipo(módulo): descrição` — tipos: `feat`, `fix`, `test`, `docs`, `data`, `refactor`, `chore`.
  Ex.: `feat(triage): resolve DNS e segue redirects`.
- Um assunto por commit. Commits feitos com o Claude levam `Co-Authored-By`.
- Tags ao fim de cada módulo: `v0.1-triagem`, `v0.2-analise`, `v0.3-recomendacao`, `v1.0`.
- Dados: `corpus.csv` e `dataset.csv` **são commitados** (commit `data(...)` com a data da coleta).
  `data/raw/` fica fora do git (pesado); será arquivado em .zip + hash SHA-256 em `docs/ambiente/`.

## Como trabalhar comigo (Claude) neste repo

- Uma sessão = uma tarefa pequena do `docs/ROTEIRO.md`. Não fazer "o módulo inteiro" de uma vez.
- Antes de codar: diga o plano em 3–6 passos e espere confirmação se envolver
  decisão metodológica (algo que a banca pode questionar). Nesse caso, sugira um ADR.
- Rode os testes antes de declarar algo pronto (`npm test`).
- Ao final, rode o comando `/fim-de-sessao` para rascunhar a entrada do diário.
- **Não invente números.** Contagens e resultados vêm de scripts executados, citados no diário.
- Não rodar coleta no corpus inteiro sem que o autor peça explicitamente.

## Mapa de documentação

- `docs/ROTEIRO.md` — sessões em ordem, com prompt pronto e critério de pronto.
- `docs/STATUS.md` — onde estamos (atualizar ao fim de cada sessão).
- `docs/diario/` — uma entrada por sessão (`AAAA-MM-DD-sNN.md`).
- `docs/decisoes/` — ADRs (`NNN-titulo.md`).
- `docs/prompts/` — prompts do LLM do módulo 3, versionados (componente do sistema).
- `docs/artigo/` — rastreabilidade objetivo → evidência → seção do texto.
- `docs/ambiente/` — versões de ferramentas, máquina, hashes dos dados.
