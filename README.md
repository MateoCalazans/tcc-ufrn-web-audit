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

## Coleta (módulo 1): como rodar e retomar

```bash
npm run collect -- --limit 10            # piloto (page + lighthouse, um site por vez)
npm run collect -- --resume              # corpus inteiro; continua de onde parou
npm run collect -- --site <id> --resume  # um site só
npm run collect -- --only page|lighthouse --resume
```

- Para cada site, roda a etapa `page` (HTML bruto, DOM renderizado, screenshot, HAR)
  e depois a `lighthouse` (3 execuções). Uma etapa está feita quando o seu registro
  (`collect.json` / `lighthouse.json`) existe. Etapas interrompidas são refeitas do
  zero, e **sites com falha não são tentados de novo** ([ADR 008](docs/decisoes/008-coleta-retomavel-sem-nova-tentativa.md)).
- Se algum site selecionado já tiver registro em `data/raw/`, o comando **exige
  `--resume`**. Para uma coleta nova, apague as pastas antes.
- `Ctrl+C` uma vez: termina o site atual e para. Duas vezes: para na hora (a etapa
  em andamento é refeita no próximo `--resume`). Se a máquina cair, basta rodar
  `--resume` de novo. **No Windows**, o `Ctrl+C` chega também ao npm e ao Chrome
  e o processo morre na hora (como uma queda): os dados não se corrompem, e a
  etapa em andamento é refeita no `--resume` (ADR 008, adendo).
- Num processo longo, a memória do node se acumula. Na coleta oficial, ele caiu
  por falta de memória no site 87. Para o corpus inteiro, rode com mais heap:
  `NODE_OPTIONS=--max-old-space-size=8192` (PowerShell: `$env:NODE_OPTIONS="--max-old-space-size=8192"`).
- Não rode nada pesado na máquina durante a coleta: a carga de CPU altera o
  `benchmarkIndex` e o throttling simulado do Lighthouse.
- O relatório `docs/resultados/coleta.md` é gerado a partir do disco com `npm run collect:report`.
- Progresso e tempo estimado no terminal. Tudo em `logs/collect-<data>.jsonl`. A
  linha `"msg":"fim"` traz o resumo (completos, com falha, pendentes e falhas por motivo),
  calculado a partir do disco.
- No piloto, cada site levou cerca de 45–70 s. A coleta oficial (242 sites) levou
  cerca de 3h41 de execução (1h19 até a queda + 2h22 na retomada), ou 4h37 do
  primeiro ao último registro, contando a pausa entre a queda e a retomada (`docs/resultados/coleta.md`).

### Rodando de madrugada

Antes de começar: working tree limpo (`git status`), para sair `gitDirty: false`,
e a máquina **na tomada e sem suspensão**, porque uma suspensão no meio do Lighthouse
derruba a execução (ela é refeita no `--resume`, mas a medição perde a hora).

**Windows (PowerShell)**: impedir a suspensão enquanto a coleta roda e deixá-la
em segundo plano, com a saída num arquivo:

```powershell
powercfg /change standby-timeout-ac 0      # sem suspensão na tomada (anote o valor anterior)
powercfg /change hibernate-timeout-ac 0
Start-Process -WindowStyle Minimized -FilePath npm.cmd `
  -ArgumentList 'run','collect','--','--resume' `
  -RedirectStandardError logs\collect-console.txt
Get-Content logs\collect-console.txt -Wait   # acompanhar (Ctrl+C só fecha o acompanhamento)
```

Ao terminar, restaure os valores do `powercfg` (padrão do Windows: `standby-timeout-ac 30`).

**Git Bash / WSL / Linux**, com `nohup` (sobrevive ao fechamento do terminal):

```bash
nohup npm run collect -- --resume > logs/collect-console.txt 2>&1 &
tail -f logs/collect-console.txt
```

Ou com `tmux` (Linux/WSL), para voltar à sessão depois:

```bash
tmux new -s coleta 'npm run collect -- --resume; read'
# desanexar: Ctrl+B, D · voltar: tmux attach -t coleta
```

Se cair, rode o mesmo comando de novo: ele continua do site onde parou.

## Documentação
- `docs/ROTEIRO.md` — plano de sessões · `docs/STATUS.md` — progresso
- `docs/diario/` — diário de bordo · `docs/decisoes/` — ADRs
- `docs/artigo/` — rastreabilidade e esqueleto do artigo

## Como reproduzir
(preencher na S19)
