# ADR 012 — Dataset da análise: saídas, conjuntos e tratamentos

**Data:** 2026-11-11 · **Status:** proposto

## Contexto
A S12 grava as saídas do módulo 2 (`npm run analyze`). Três pontos ficaram
pendentes das sessões anteriores: onde gravar o `metrics.json` por site, o que
fazer com os sites cujo `rendered.html` é o stub de meta refresh (ADR 010) ou
está vazio, e se a validação vnu (ADR 011, item 8) entra no dataset oficial.

## Opções consideradas e decisão
1. **Onde gravar o `metrics.json`**
   - a) `data/raw/<site>/metrics.json`, como está na tabela do `CLAUDE.md`.
     Contras: a regra 8 diz que os brutos são imutáveis, e o manifesto SHA-256
     da S08 (`docs/ambiente/raw-manifesto-2026-11-09.sha256`) descreve essa
     pasta. Misturar derivados com brutos confunde a conferência.
   - b) **`data/processed/sites/<site>/metrics.json`** (escolhida). Fica fora
     do git, porque pode ser regerado dos brutos; o `dataset.csv` é commitado.
     A tabela do `CLAUDE.md` foi corrigida.
2. **Conjuntos e flags** (nenhum site sai do dataset; todos ficam com a flag):
   - `conjunto_principal` = performance `completo` e sem exclusão (ADR 009);
   - o índice é `null` quando a semântica tem status `vazio` ou `sem-arquivo`
     (6 sites `vazio`, S10: `ppget`, `sire` e as 4 páginas de teste da STI);
   - os 9 sites do conjunto principal com `renderedComRefresh` ficam no
     dataset, com índice e com a flag. A S13 analisa com e sem eles
     (sensibilidade), em vez de excluir agora.
3. **vnu no dataset oficial:** **sim**, com `--vnu`. As colunas
   `vnu_status`, `vnu_erros` e `vnu_avisos` ficam no dataset e não entram no
   índice (ADR 003).
4. **Metadados do CSV (regra 10):** o CSV não tem onde guardar `meta`. Ele vai
   num arquivo ao lado, `data/processed/dataset.meta.json`, com `generatedAt`,
   `toolVersions`, `gitCommit`, `gitDirty`, a lista de colunas e o número de
   linhas.
5. **Colunas de contexto:** `tipo` e `tecnologia` vêm do `data/corpus.csv`
   (S04), para a comparação por tecnologia da S13.

## Justificativa
- 1b mantém a separação entre bruto imutável e derivado, que a regra 8 pede.
- 2: excluir os stubs ou as páginas vazias antes de ver o efeito seria
  escolher o método pelo resultado (mesmo argumento do ADR 010, 1a).
- 3: o dataset é o que vai ser citado, e rodar o vnu custa ~7 min.

## Consequências
- Positivas: um dataset completo e autodescrito; nenhum dado bruto alterado.
- Negativas / limitações:
  - a S13 precisa filtrar com as flags; o dataset não é "pronto para média"
    sem filtro;
  - os `metrics.json` não ficam versionados (regeráveis com `npm run analyze`
    sobre os brutos arquivados).

## Onde aparece no TCC
Metodologia (dados e reprodutibilidade).
