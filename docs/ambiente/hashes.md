# Hashes dos dados

| Arquivo | SHA-256 | Data |
|---|---|---|
| data/input/registros-ufrn.txt (1.290 linhas) | 096caf52638dc0b129181595117ed642c10ad7ea0eb38d2884b6d1c886c1f79e | 2026-10-19 |
| data/raw-coleta-2026-11-09.zip (coleta oficial S08: 242 sites, 2.177 arquivos, 1.068.651.186 bytes; fora do git) | 9b0516b98d88bcd4f4b5e6b40d740fafa459d00f16592a8a6c2ab829d30807e6 | 2026-11-09 |
| docs/ambiente/raw-manifesto-2026-11-09.sha256 (SHA-256 de cada arquivo de `data/raw/`, 2.176 linhas) | 8a8f5ede5638d52b9f9d294cc07cc3126b9601ea6e5baf73f2d31205a716204b | 2026-11-09 |

**Como conferir a coleta (S08):**
- O .zip: `sha256sum data/raw-coleta-2026-11-09.zip`. O .zip foi gerado com o `tar.exe` do Windows (`tar -a -c -f raw-coleta-2026-11-09.zip raw`, de dentro de `data/`); recompactar muda o hash.
- Os brutos, independentemente do .zip: `cd data/raw && sha256sum -c ../../docs/ambiente/raw-manifesto-2026-11-09.sha256`.
