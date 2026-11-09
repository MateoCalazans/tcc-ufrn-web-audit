# Status do projeto

> Atualizado ao fim de cada sessão (o `/fim-de-sessao` faz isso).

**Última atualização:** 2026-11-09
**Fase atual:** 2 — Coleta
**Próxima sessão:** S06

| Sessão | Situação | Data | Diário | Commits/tag |
|---|---|---|---|---|
| S00 | ✅ | 2026-10-19 | [s00](diario/2026-10-19-s00.md) | (a commitar) |
| S01 | ✅ | 2026-10-19 | [s01](diario/2026-10-19-s01.md) | (a commitar) |
| S02 | ✅ | 2026-10-20 | [s02](diario/2026-10-20-s02.md) | (a commitar) |
| S03 | ✅ | 2026-10-20 | [s03](diario/2026-10-20-s03.md) | (a commitar) |
| S04 | ✅ | 2026-11-04 / 11-09 | [s04](diario/2026-11-04-s04.md) | (a commitar) · v0.1-triagem |
| S05 | ✅ | 2026-11-09 | [s05](diario/2026-11-09-s05.md) | cf5a554 9b106c8 |
| S06 | ⬜ | | | |
| S07 | ⬜ | | | |
| S08 | ⬜ | | | coleta congelada |
| S09 | ⬜ | | | |
| S10 | ⬜ | | | |
| S11 | ⬜ | | | |
| S12 | ⬜ | | | v0.2-analise |
| S13 | ⬜ | | | |
| S14 | ⬜ | | | |
| S15 | ⬜ | | | |
| S16 | ⬜ | | | v0.3-recomendacao |
| S17 | ⬜ | | | |
| S18 | ⬜ | | | v1.0 |
| S19 | ⬜ | | | |

Legenda: ⬜ pendente · 🟨 em andamento · ✅ concluída · ✂️ cortada (ver ADR)

## Pendências para o orientador
- `data/interim/` não está no `.gitignore` e `normalized.csv` já foi commitado na S02 (contradiz o diário da S02). Decidir: versionar o interim de propósito ou ignorá-lo. (ver diário S03)
- Confirmar o contato definitivo do User-Agent (`CONTACT_EMAIL`); hoje está com o gmail do autor no `.env` local.
- Avaliar se `timeout` deve distinguir "conexão recusada" / "redirect-loop" como código próprio no ADR 002 (hoje só a coluna `detalhe` distingue).
- **(S04)** Validar o [ADR 005](decisoes/005-acessibilidade-na-triagem.md) (proposto): certificado TLS inválido incluído com `tls_invalido` (52 dos 242 incluídos) e triagem oficial feita de fora da UFRN (380 hosts não aceitam conexão dessa rede).
- **(S04)** Revisão manual da classificação não feita, por decisão do autor: a taxa de acerto não foi medida (ameaça à validade, ADR 005). Placeholders ("Site em Construção", "Página de Teste"…) ficaram no corpus.
- **(S04)** 37 sites `*.ct.ufrn.br` redirecionam para `api-boreas.ct.ufrn.br`, que não existe no DNS. Avisar a unidade? Criar código de exclusão próprio?
- **(S04)** Pedir à STI/SINFO a liberação do nosso User-Agent (servidores que derrubam a conexão ou respondem 403, como `acervo.ufrn.br`).
- **(S06)** Sites com `tls_invalido` exigem Lighthouse com `--ignore-certificate-errors`.
- **(S08)** Apagar os dados do piloto da S05 em `data/raw/` (11 pastas, `gitDirty: true`) antes da coleta oficial.
- **(S05)** Validar o [ADR 006](decisoes/006-parametros-da-coleta-renderizada.md) (proposto): parâmetros da coleta renderizada.
- **(S05)** `pingifes.ufrn.br` redireciona por meta refresh para uma tela de login (regra 4) e `comunica.ufrn.br` para um stream de áudio: corrigir o corpus antes da S08?
- **(S06/S10)** 23 incluídos usam meta refresh (bruto ≠ renderizado). Decidir o tratamento no Lighthouse e na análise (talvez emenda ao ADR 006).

## Bloqueios
-
