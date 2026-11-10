# Status do projeto

> Atualizado ao fim de cada sessão (o `/fim-de-sessao` faz isso).

**Última atualização:** 2026-11-10
**Fase atual:** 3 — Análise (coleta congelada em 2026-11-09)
**Próxima sessão:** S09

| Sessão | Situação | Data | Diário | Commits/tag |
|---|---|---|---|---|
| S00 | ✅ | 2026-10-19 | [s00](diario/2026-10-19-s00.md) | (a commitar) |
| S01 | ✅ | 2026-10-19 | [s01](diario/2026-10-19-s01.md) | (a commitar) |
| S02 | ✅ | 2026-10-20 | [s02](diario/2026-10-20-s02.md) | (a commitar) |
| S03 | ✅ | 2026-10-20 | [s03](diario/2026-10-20-s03.md) | (a commitar) |
| S04 | ✅ | 2026-11-04 / 11-09 | [s04](diario/2026-11-04-s04.md) | (a commitar) · v0.1-triagem |
| S05 | ✅ | 2026-11-09 | [s05](diario/2026-11-09-s05.md) | cf5a554 9b106c8 |
| S06 | ✅ | 2026-11-09 | [s06](diario/2026-11-09-s06.md) | 2a9eda5 854148c |
| S07 | ✅ | 2026-11-09 | [s07](diario/2026-11-09-s07.md) | f2677fe db15943 |
| S08 | ✅ | 2026-11-09 / 11-10 | [s08](diario/2026-11-10-s08.md) | 1e9e659 91cbfc5 78a1f86 f85a63d 01b9829 · coleta congelada (sem tag) |
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
- **(S05)** Validar o [ADR 006](decisoes/006-parametros-da-coleta-renderizada.md) (proposto): parâmetros da coleta renderizada.
- **(S05/S08)** `pingifes.ufrn.br` (meta refresh para login, regra 4) e `comunica.ufrn.br` (stream de áudio, Lighthouse `NOT_HTML`) ficaram no corpus e foram coletados. Decisão A do autor: excluir na análise, com motivo. **Falta um ADR** (S09/S10).
- **(S10)** 23 incluídos usam meta refresh (bruto ≠ renderizado). O Lighthouse segue o redirecionamento e mede a página de destino (S06, `acervus`). Falta decidir o tratamento na análise.

- **(S06)** Validar o [ADR 007](decisoes/007-parametros-do-lighthouse.md) (proposto): parâmetros do Lighthouse.
- **(S06)** Variabilidade do Lighthouse no piloto: amplitude da nota de performance de até 32 pontos (mediana 8). Manter 3 execuções (regra 6) ou subir para 5?
- **(S07)** Validar o [ADR 008](decisoes/008-coleta-retomavel-sem-nova-tentativa.md) (proposto): coleta retomável, sites com falha não são tentados de novo.
- **(S08)** `Ctrl+C` testado no Windows: não para de forma limpa (o processo morre na hora, código 1), mas equivale a uma queda e não corrompe os dados (adendo ao ADR 008).
- **(S06/S09)** O critério da mediana (nota) e o `computeMedianRun` (FCP/TTI) **divergem em 132 de 225 sites** no corpus (`coleta.md`). Decidir em ADR, na S09, qual execução alimenta as métricas.

- **(S08)** Validar o adendo ao [ADR 008](decisoes/008-coleta-retomavel-sem-nova-tentativa.md): coleta em 2 execuções (queda por memória no site 87, retomada com heap de 8 GB, 56 min de pausa).
- **(S08)** 25 sites com falha (10,3%): 13 `NO_FCP`, 6 `NO_NAVSTART`, 2 `bruto:AbortError`, 2 `ERRORED_DOCUMENT_REQUEST`, 1 `NOT_HTML`, 1 `sem-nota`. Olhar os `NO_FCP`/`NO_NAVSTART` na análise.
- **(S08)** Variação do Lighthouse no corpus: mediana da amplitude de 2, máxima de 35, 27 sites com ≥ 10 pontos (ameaça à validade; a coleta está congelada).
- **(S08)** Aviso à STI/SINFO não enviado, por decisão do autor (desvio do roteiro).
- **(S08)** Guardar cópia do `data/raw-coleta-2026-11-09.zip` (1,07 GB, SHA-256 em `docs/ambiente/hashes.md`) fora deste PC. Decidir sobre a tag de congelamento.

## Bloqueios
-
