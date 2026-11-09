# Resultados da triagem (módulo 0)

> Gerado por `npm run triage -- --classify`. Não editar à mão: rode o comando de novo.

- **Data da sondagem:** 2026-11-04
- **Gerado em:** 2026-11-04T19:32:43.633Z
- **Commit:** `a2bd994b716d39f34f3e26e84e4cfd34dcfadb2d` (com alterações não commitadas)
- **Node:** 24.19.0

## Funil

| Etapa | n |
|---|---:|
| Linhas da lista | 1290 |
| Únicos (sem duplicata exata) | 1288 |
| Unificados (www / .edu.br / malformados) | 1100 |
| Após filtro de infraestrutura | 1050 |
| Sondados | 1050 |
| **Incluídos no corpus** | **242** |

Dos incluídos, **52** têm certificado TLS inválido (lidos sem verificar o certificado, pois o conteúdo é público e o navegador permite o acesso):

| Problema de certificado | n | % |
|---|---:|---:|
| cert-cadeia-incompleta | 41 | 78,8% |
| cert-expirado | 6 | 11,5% |
| cert-nome-divergente | 5 | 9,6% |
| **total** | **52** | |

## Exclusões na sondagem (ADR 002)

| Motivo | n | % |
|---|---:|---:|
| timeout | 437 | 54,1% |
| dns | 214 | 26,5% |
| 4xx | 80 | 9,9% |
| login | 36 | 4,5% |
| 5xx | 20 | 2,5% |
| duplicata-redirect | 11 | 1,4% |
| pagina-padrao | 6 | 0,7% |
| robots | 3 | 0,4% |
| nao-html | 1 | 0,1% |
| **total** | **808** | |

## Incluídos por tipo

Heurística de título + hostname (`src/triage/classify.ts`). `outro` = sem sinal claro (a heurística não chuta).

| Tipo | n | % |
|---|---:|---:|
| outro | 182 | 75,2% |
| evento | 20 | 8,3% |
| unidade | 19 | 7,9% |
| laboratorio | 9 | 3,7% |
| pos-graduacao | 7 | 2,9% |
| departamento | 4 | 1,7% |
| projeto | 1 | 0,4% |
| **total** | **242** | |

## Incluídos por tecnologia

`estatico` = nenhuma assinatura de CMS ou framework JS detectada no HTML da página inicial (não garante que o site seja estático). `outro-cms` = `meta generator` de outra ferramenta.

| Tecnologia | n | % |
|---|---:|---:|
| estatico | 137 | 56,6% |
| framework-js | 49 | 20,2% |
| wordpress | 45 | 18,6% |
| outro-cms | 9 | 3,7% |
| joomla | 2 | 0,8% |
| **total** | **242** | |

## Tipo × tecnologia (incluídos)

| Tipo | estatico | framework-js | wordpress | outro-cms | joomla |
|---|---:|---:|---:|---:|---:|
| outro | 111 | 38 | 23 | 8 | 2 |
| evento | 7 | 6 | 7 | 0 | 0 |
| unidade | 11 | 1 | 6 | 1 | 0 |
| laboratorio | 4 | 2 | 3 | 0 | 0 |
| pos-graduacao | 2 | 2 | 3 | 0 | 0 |
| departamento | 1 | 0 | 3 | 0 | 0 |
| projeto | 1 | 0 | 0 | 0 | 0 |
