# Hashes dos dados

| Arquivo | SHA-256 | Data |
|---|---|---|
| data/input/registros-ufrn.txt (1.290 linhas) | 096caf52638dc0b129181595117ed642c10ad7ea0eb38d2884b6d1c886c1f79e | 2026-10-19 |
| data/raw-coleta-2026-11-09.zip (coleta oficial S08: 242 sites, 2.177 arquivos, 1.068.651.186 bytes; fora do git) | 9b0516b98d88bcd4f4b5e6b40d740fafa459d00f16592a8a6c2ab829d30807e6 | 2026-11-09 |
| docs/ambiente/raw-manifesto-2026-11-09.sha256 (SHA-256 de cada arquivo de `data/raw/`, 2.176 linhas) | 8a8f5ede5638d52b9f9d294cc07cc3126b9601ea6e5baf73f2d31205a716204b | 2026-11-09 |
| data/processed/dataset.csv (S12: 242 linhas × 83 colunas, gerado no commit `ffb7132` com `gitDirty: false`; arquivo com LF, como gravado pelo `npm run analyze`) | f00b6dd951c958c4093998b442d83c1719f6a0ac7ba8c9da1c7a438cbfe48775 | 2026-11-11 |
| node_modules/vnu-jar/build/dist/vnu.jar (pacote npm `vnu-jar` 26.10.12; `--version` → `26.10.12 (973e40b)`; usado com o JDK 24.0.1, ADR 011, item 8) | fce588daa21269fc0ab1090da7e28a4455ca785fd460ca9c754f1351c129f138 | 2026-11-11 |

**Como conferir a coleta (S08):**
- O .zip: `sha256sum data/raw-coleta-2026-11-09.zip`. O .zip foi gerado com o `tar.exe` do Windows (`tar -a -c -f raw-coleta-2026-11-09.zip raw`, de dentro de `data/`); recompactar muda o hash.
- Os brutos, independentemente do .zip: `cd data/raw && sha256sum -c ../../docs/ambiente/raw-manifesto-2026-11-09.sha256`.

**Como conferir o dataset (S12):** `sha256sum data/processed/dataset.csv`. O hash é o do arquivo com LF. Num checkout no Windows com `core.autocrlf=true`, o git converte para CRLF e o hash muda sem que os dados mudem. Nesse caso, confira com `git show v0.2-analise:data/processed/dataset.csv | sha256sum`, ou regenere com `npm run analyze -- --vnu`, com a árvore limpa e sem as saídas anteriores.
