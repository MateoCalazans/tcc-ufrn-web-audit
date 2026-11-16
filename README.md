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
npm run triage                    # normalização da lista (data/interim/)
npm run triage -- --probe         # sondagem DNS/HTTP/robots (rede)
npm run triage -- --classify      # data/corpus.csv (offline)
npm run collect -- --limit 10     # piloto
npm run collect -- --resume       # corpus completo
npm run analyze -- --vnu          # data/processed/dataset.csv
npm run report                    # reports/ (fora do git)
npm run recommend -- --site <id> [--llm]
npm run validate -- run --sample data/validation/amostra.csv
npm test
```

### Interface (ADR 017)
```bash
npm run ui                        # compila ui/ e abre em http://127.0.0.1:5179/ (só local)
npm run ui:dev                    # Vite com proxy (rodar npm run ui:server ao lado)
npm run ui:axe                    # axe nas telas, com o servidor no ar → docs/resultados/ui-axe.json
```

O passo a passo completo, com versões e conferência de hashes, está em
[Como reproduzir](#como-reproduzir).

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

Há dois caminhos.
- **A — a partir dos brutos arquivados.** Refaz a análise, os relatórios e a estatística
  sobre a mesma coleta do TCC (2026-11-09). O `dataset.csv` sai idêntico, byte a byte.
- **B — do zero.** Refaz a triagem e a coleta nos sites de hoje. O pipeline é o mesmo,
  mas os números mudam, porque os sites mudam (ver "Ameaças à validade" em
  [rastreabilidade.md](docs/artigo/rastreabilidade.md)).

Os resultados do TCC são os da tag `v1.0`. A tag `v1.0.1-regras` é a análise posterior
da S18b ([adendo ao ADR 004](docs/decisoes/004-amostra-e-protocolo-da-validacao.md)).
Onde estão as evidências: [índice de evidências](docs/artigo/indice-evidencias.md).

### 1. Ambiente

Versões usadas (registro completo em [`docs/ambiente/`](docs/ambiente/)):

| Ferramenta | Versão | Observação |
|---|---|---|
| Node.js | 24.19.0 (mínimo 20) | `npm run env` grava as versões em `docs/ambiente/ambiente-<data>.json` |
| Chrome | 155.0.8059.80 | Lighthouse 13.5.0, via `chrome-launcher` |
| Chromium do Playwright | 156.0.8078.4 | `npx playwright install chromium` (Playwright 1.64.1) |
| Java | JDK 24.0.1 | só para o `--vnu` (`vnu-jar` 26.10.12). O código usa o `JAVA_HOME`, não o `java` do PATH |
| Python | 3.13.5 | só para os notebooks: `analysis/requirements.txt` |
| Máquina da coleta | Windows 11, Intel Core Ultra 7 155H, 32 GB | o throttling simulado do Lighthouse depende da CPU (`benchmarkIndex`) |

```bash
git clone <repo> && cd tcc-ufrn-web-audit
git checkout v1.0                       # ou v1.0.1-regras, para a análise posterior
npm ci && npx playwright install chromium
python -m pip install -r analysis/requirements.txt
cp .env.example .env                    # CONTACT_EMAIL (User-Agent); ANTHROPIC_API_KEY só para --llm
npm test                                # mais de 400 testes; ver nota do Windows abaixo
```

**Windows: dois cuidados.**
- **Letra do disco.** Rode tudo de `C:\…`, com C maiúsculo. Com o caminho `c:\…`, o vitest falha em 25 arquivos de teste. O `npx vitest` às vezes reintroduz o `c:` minúsculo. Se acontecer, use `node node_modules/vitest/vitest.mjs run`.
- **Fins de linha.** O `.gitattributes` grava os arquivos com LF. Se o `core.autocrlf` estiver ativo, confira o hash do `dataset.csv` direto do git (passo A.3).

### Caminho A — a partir dos brutos arquivados

1. **Obter os brutos.** `data/raw/` fica fora do git (cerca de 1 GB). Peça ao autor o
   `raw-coleta-2026-11-09.zip`, coloque-o em `data/` e confira o hash:
   ```bash
   sha256sum data/raw-coleta-2026-11-09.zip   # 9b0516b9…07e6 (docs/ambiente/hashes.md)
   cd data && unzip raw-coleta-2026-11-09.zip && cd ..   # no Windows: tar -xf raw-coleta-2026-11-09.zip
   cd data/raw && sha256sum -c ../../docs/ambiente/raw-manifesto-2026-11-09.sha256 && cd ../..
   ```
   O corpus da coleta (`data/corpus.csv`, sondagem de 2026-11-04) está no git.
2. **Análise (módulo 2).** Rode com a árvore limpa e sem saídas anteriores. Se já existir um
   `data/processed/sites/`, apague-o antes: o `gitDirty` conta arquivos fora do git.
   ```bash
   npm run analyze -- --vnu      # grava metrics.json por site e data/processed/dataset.csv
   ```
3. **Conferir o dataset.** Compare com o hash da S12 (`f00b6dd9…8775`, em
   [`docs/ambiente/hashes.md`](docs/ambiente/hashes.md)):
   ```bash
   sha256sum data/processed/dataset.csv
   git show v0.2-analise:data/processed/dataset.csv | sha256sum   # referência, independente do checkout
   ```
4. **Relatórios e estatística do diagnóstico.**
   ```bash
   npm run report                                                  # reports/ (HTML por site + panorama)
   python -m jupyter nbconvert --to notebook --execute --inplace analysis/diagnostico.ipynb
   ```
   O notebook regrava `docs/resultados/tabelas/` e `docs/resultados/figuras/`. Confira com `git diff`.
5. **Recomendação (módulo 3) na amostra da validação.**
   ```bash
   npx tsx scripts/amostra-validacao.ts          # data/validation/amostra.csv (determinístico)
   npm run recommend -- --site <id> [--site <id> ...]          # só regras: determinístico, sem custo
   npm run recommend -- --site <id> [--site <id> ...] --llm    # + landmarks-llm (API da Anthropic, custo)
   ```
   Os 12 sites estão na coluna `id` de `data/validation/amostra.csv`. A `landmarks-llm`
   roda sem temperatura 0, então as propostas podem variar entre rodadas (ADR 016). As
   execuções do TCC estão em `data/processed/llm-runs.csv`, com o prompt, o modelo e o custo.
6. **Validação (módulo 4) e estatística.**
   ```bash
   npm run validate -- run --sample data/validation/amostra.csv
   python -m jupyter nbconvert --to notebook --execute --inplace analysis/validacao.ipynb
   ```
   Original e corrigido são cópias locais montadas do `page.har` da coleta, servidas pelo
   mesmo servidor, com a rede externa bloqueada (regra 7, ADR 018). As medições do
   Lighthouse variam entre rodadas, então os números não saem idênticos aos do TCC. O
   protocolo e o teste (Wilcoxon pareado com Holm) são os mesmos. Os resultados do TCC
   estão em `data/processed/validation-v1.0.csv` (`v1.0`) e `data/processed/validation.csv`
   (rodada posterior, S18b).

### Caminho B — do zero

Antes de começar, leia as regras éticas da coleta em `CLAUDE.md`: no máximo 2 hosts em
paralelo, `robots.txt` respeitado e só a página inicial pública. Preencha o `CONTACT_EMAIL`
no `.env`, porque ele vai no User-Agent.

```bash
npm run env                                  # registra o ambiente
npm run triage                               # data/input/registros-ufrn.txt → data/interim/
npm run triage -- --probe                    # DNS/HTTP/robots (acessa a rede)
npm run triage -- --classify                 # data/corpus.csv
npm run collect -- --limit 10                # piloto
npm run collect -- --resume                  # corpus inteiro; ver "Coleta (módulo 1)" acima
npm run collect:report                       # docs/resultados/coleta.md
```

Depois disso, siga o caminho A a partir do passo 2. A lista de entrada
(`data/input/registros-ufrn.txt`) está no git, com o hash em `docs/ambiente/hashes.md`.
A sondagem depende da rede de onde ela roda: a triagem oficial foi feita de fora da UFRN (ADR 005).

### O que é e o que não é reprodutível byte a byte

| Saída | Byte a byte? | Por quê |
|---|---|---|
| `data/processed/dataset.csv` (a partir dos brutos) | Sim | análise pura sobre `data/raw/` (regra 8) |
| `data/validation/amostra.csv` | Sim | determinística sobre o dataset e as regras |
| `fixed.html` / `fix.diff` só com regras, na `v1.0` | Sim | regras determinísticas sobre o bruto. Na `v1.0.1-regras`, a guarda de imagens mede o tamanho exibido no navegador (adendo ao ADR 014), e isso não foi testado quanto à repetibilidade |
| Propostas da `landmarks-llm` | Não | LLM sem temperatura 0 (ADR 016) |
| Medições do Lighthouse (coleta e validação) | Não | variação entre execuções; por isso 3 execuções e a mediana (ADR 007, ADR 009) |
| Triagem e coleta (caminho B) | Não | os sites mudam, e a rede de origem afeta a sondagem |
