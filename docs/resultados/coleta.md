# Resultados da coleta (módulo 1)

> Gerado por `npm run collect:report` a partir de `data/raw/`. Não editar à mão: rode o comando de novo.

- **Gerado em:** 2026-11-10T13:44:40.179Z
- **Commit do relatório:** `78a1f86c62d524ece7857af7f0ea6aa942b98524`
- **Início da coleta:** 2026-11-09T18:06:41.950Z (primeiro `collectedAt`)
- **Fim da coleta:** 2026-11-09T22:44:16.967Z (fim da última execução do Lighthouse)
- **Duração (início → fim):** 4h37min

## Proveniência dos registros

Cada site tem até 2 registros (`collect.json` e `lighthouse.json`).

| Commit da coleta | registros |
|---|---:|
| `3b2ba91cb6f9f1312623d7e4c6e0889ec053e2e5` | 484 |

| Ferramenta | registros |
|---|---:|
| chromium 156.0.8078.4 | 484 |
| lighthouse 13.5.0 | 484 |
| node 24.19.0 | 484 |
| playwright 1.64.1 | 484 |

## Resumo

| Situação | sites | % |
|---|---:|---:|
| Completos (page + lighthouse) | 217 | 89,7% |
| Com falha | 25 | 10,3% |
| Pendentes | 0 | 0,0% |
| **Total (incluídos no corpus)** | **242** | |

| Etapa | completos | incompletos | ilegíveis | pendentes |
|---|---:|---:|---:|---:|
| page | 240 | 2 | 0 | 0 |
| lighthouse | 219 | 23 | 0 | 0 |

## Falhas por motivo (ADR 008)

Um site pode ter mais de um motivo. Sites com falha não foram tentados de novo.

| Motivo | sites |
|---|---:|
| `lighthouse:NO_FCP` | 13 |
| `lighthouse:NO_NAVSTART` | 6 |
| `bruto:AbortError` | 2 |
| `lighthouse:ERRORED_DOCUMENT_REQUEST` | 2 |
| `lighthouse:NOT_HTML` | 1 |
| `lighthouse:sem-nota` | 1 |

| Site | page | lighthouse | motivos |
|---|---|---|---|
| chico.ufrn.br | completo | incompleto | `lighthouse:ERRORED_DOCUMENT_REQUEST` |
| imias.ufrn.br | completo | incompleto | `lighthouse:NO_FCP` |
| ppget.ufrn.br | completo | incompleto | `lighthouse:NO_FCP` |
| sire.ufrn.br | completo | incompleto | `lighthouse:NO_FCP` |
| sisbi.ufrn.br | completo | incompleto | `lighthouse:ERRORED_DOCUMENT_REQUEST` |
| thevideogame.ufrn.br | completo | incompleto | `lighthouse:NO_FCP` |
| 2enappe.ce.ufrn.br | incompleto | completo | `bruto:AbortError` |
| comunica.ufrn.br | completo | incompleto | `lighthouse:NOT_HTML` |
| escoladesaude.ufrn.br | completo | incompleto | `lighthouse:NO_NAVSTART` |
| fmu.ufrn.br | completo | incompleto | `lighthouse:NO_FCP` |
| gow12.dca.ufrn.br | completo | incompleto | `lighthouse:NO_FCP` |
| ism.ccsa.ufrn.br | completo | incompleto | `lighthouse:NO_NAVSTART` |
| lii.dca.ufrn.br | completo | incompleto | `lighthouse:NO_NAVSTART` |
| linguaportuguesa.ufrn.br | completo | incompleto | `lighthouse:NO_FCP` |
| mediotec.imd.ufrn.br | completo | incompleto | `lighthouse:NO_FCP` |
| npad.imd.ufrn.br | completo | incompleto | `lighthouse:NO_FCP` |
| ppged.ufrn.br | incompleto | completo | `bruto:AbortError` |
| ppghc.ceres.ufrn.br | completo | incompleto | `lighthouse:NO_FCP` |
| proeva.ccs.ufrn.br | completo | incompleto | `lighthouse:NO_FCP` |
| proex.ufrn.br | completo | incompleto | `lighthouse:NO_NAVSTART` |
| sbai2015.dca.ufrn.br | completo | incompleto | `lighthouse:NO_NAVSTART` |
| sbpo2013.ect.ufrn.br | completo | incompleto | `lighthouse:NO_FCP` |
| titan.ect.ufrn.br | completo | incompleto | `lighthouse:NO_NAVSTART` |
| tronco.cchla.ufrn.br | completo | incompleto | `lighthouse:NO_FCP` |
| www2.ccet.ufrn.br | completo | incompleto | `lighthouse:sem-nota` |

## Lighthouse: variação entre as 3 execuções

| Indicador | valor |
|---|---:|
| Sites com amplitude calculada | 225 |
| Mediana da amplitude (pontos) | 2 |
| Maior amplitude (pontos) | 35 |
| Sites com amplitude ≥ 10 pontos | 27 |
| Mediana pela nota ≠ `computeMedianRun` (FCP/TTI) | 132 de 225 |

## Outros

- Sites com `<meta http-equiv="refresh">` no HTML bruto: **23** (tratamento na análise, S10).
