# Status do projeto

> Atualizado ao fim de cada sessão (o `/fim-de-sessao` faz isso).

**Última atualização:** 2026-10-20
**Fase atual:** 1 — Triagem
**Próxima sessão:** S04

| Sessão | Situação | Data | Diário | Commits/tag |
|---|---|---|---|---|
| S00 | ✅ | 2026-10-19 | [s00](diario/2026-10-19-s00.md) | (a commitar) |
| S01 | ✅ | 2026-10-19 | [s01](diario/2026-10-19-s01.md) | (a commitar) |
| S02 | ✅ | 2026-10-20 | [s02](diario/2026-10-20-s02.md) | (a commitar) |
| S03 | ✅ | 2026-10-20 | [s03](diario/2026-10-20-s03.md) | (a commitar) |
| S04 | ⬜ | | | v0.1-triagem |
| S05 | ⬜ | | | |
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

## Bloqueios
-
