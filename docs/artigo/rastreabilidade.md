# Rastreabilidade: objetivo → evidência → texto

Cada objetivo específico precisa apontar para arquivos reais do repo e para a seção
do TCC/artigo onde é discutido. Se uma linha não tem evidência, o objetivo não foi cumprido.

| # | Objetivo específico | Sessões | Evidência (arquivos, tags) | Seção do TCC | Seção do artigo |
|---|---|---|---|---|---|
| OE1 | Construir e filtrar o corpus a partir da lista de domínios | S02–S04 | `src/triage/normalize.ts` + testes (S02, funil 1290→1288→1100→1050), `src/triage/probe.ts` + testes (S03, sondagem DNS/HTTP/robots, motivos do ADR 002; S04, causa exata das falhas, certificado inválido, `--retry`), `src/triage/classify.ts` + `src/triage/corpus.ts` + testes (S04, tecnologia e tipo com evidência), `data/corpus.csv` (S04: 1.100 linhas, 242 incluídos, sondagem de 2026-11-04), `docs/resultados/triagem.md` (S04, funil e contagens), `docs/resultados/revisao-classificacao.csv` e `revisao-ressondagem.csv` (S04, amostras geradas; revisão não feita), ADR 001, ADR 002, ADR 005 (S04, certificado inválido, rede da triagem, classificação não validada), tag v0.1-triagem | Metodologia 3.x | Método — Corpus |
| OE2 | Coletar HTML bruto, DOM renderizado e relatórios Lighthouse | S01, S05–S08 | `docs/ambiente/ambiente-2026-10-19.json` (S01), `src/collect/page.ts` + `src/collect/index.ts` + testes (S05: HTML bruto, DOM renderizado, screenshot, HAR, `metaRefresh`; piloto 10/10 completos), ADR 006 (S05, parâmetros da coleta renderizada), `src/collect/lighthouse.ts` + testes (S06: Lighthouse 3× com mediana, versões registradas; piloto 11/11 completos), ADR 007 (S06, parâmetros do Lighthouse), `docs/resultados/coleta.md`, `docs/ambiente/hashes.md` | Metodologia 3.x; Cap. 5 | Método — Coleta |
| OE3 | Definir e calcular métricas de semântica HTML | S10–S12 | `src/analyze/semantics.ts`, testes, ADR 003, `dataset.csv`, tag v0.2-analise | Fundamentação; Metodologia | Método — Métricas |
| OE4 | Relatórios individuais e panorama consolidado | S13 | `reports/`, `analysis/diagnostico.ipynb`, `docs/resultados/figuras/` | Resultados — Diagnóstico | Resultados (RQ1) |
| OE5 | Recomendações por regras + LLM | S14–S16 | `src/recommend/`, `docs/artigo/catalogo-regras.md`, `docs/prompts/`, tag v0.3 | Cap. 5 | Abordagem |
| OE6 | Avaliar impacto antes/depois em amostra | S17–S18 | ADR 004, `validation.json`, `analysis/validacao.ipynb`, tag v1.0 | Resultados — Validação | Resultados (RQ2) |

## Perguntas de pesquisa (para o artigo)

- **RQ1** — Qual o estado de performance e semântica HTML dos sites públicos da UFRN? (OE1–OE4)
- **RQ2** — As notas de semântica se correlacionam com acessibilidade e performance? (OE4)
- **RQ3** — Em que medida as recomendações automáticas melhoram as métricas? (OE5–OE6)

## Ameaças à validade (preencher ao longo do projeto)

| Tipo | Ameaça | Mitigação | Fonte |
|---|---|---|---|
| Interna | Variabilidade do Lighthouse (piloto: amplitude da nota de performance de 0 a 32 pontos, mediana 8; DP amostral médio 6,49) | 3 execuções, execução mediana pela nota, Chrome novo por execução, mesma máquina; `benchmarkIndex` e as 3 notas registrados por site | ADR 007, S06 (diário) |
| Interna | Cópia local ≠ site real (recursos externos) | Comparar cópia × cópia; documentar recursos ausentes | S17 |
| Construto | Índice de semântica com pesos arbitrários | Indicadores brutos no dataset; análise de sensibilidade | ADR 003 |
| Externa | Só página inicial | Declarado no escopo | ADR 001 |
| Interna | DOM capturado após `networkidle` com teto de 30 s; bruto e renderizado vêm de 2 requisições; nosso User-Agent em vez de um móvel real | `networkidleTimeout` e `metaRefresh` registrados por site | ADR 006, S05 (diário) |
| Externa | Só UFRN; sites mudam | Data da coleta; dados arquivados com hash | S08 |
| Conclusão | Amostra de validação pequena | Teste não paramétrico; reportar tamanho de efeito | ADR 004 |
