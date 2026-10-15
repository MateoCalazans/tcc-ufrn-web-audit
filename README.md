# tcc-ufrn-web-audit

Análise automatizada de performance e semântica HTML nos sites públicos da UFRN.
TCC 2 — Bacharelado (UFRN/EAJ), 2026. Orientador: Prof. Taniro.

## Sobre a coleta (para administradores dos sites)
Este projeto acessa **apenas a página inicial pública** dos sites `*.ufrn.br`, com no
máximo 2 hosts em paralelo, pausa entre requisições, respeitando `robots.txt`.
User-Agent: `TCC-EAJ-UFRN-Audit`. Contato: <e-mail>.

## Pipeline
`triage → collect → analyze → recommend → validate → report` — ver `CLAUDE.md`.

```bash
npm install && npx playwright install chromium
npm run env                       # registra versões das ferramentas
npm run triage                    # data/corpus.csv
npm run collect -- --limit 10     # piloto
npm run collect -- --resume       # corpus completo
npm run analyze                   # data/processed/dataset.csv
npm run recommend -- --site <id>
npm run validate -- --sample data/processed/amostra.csv
npm run report
npm test
```

## Documentação
- `docs/ROTEIRO.md` — plano de sessões · `docs/STATUS.md` — progresso
- `docs/diario/` — diário de bordo · `docs/decisoes/` — ADRs
- `docs/artigo/` — rastreabilidade e esqueleto do artigo

## Como reproduzir
(preencher na S19)
