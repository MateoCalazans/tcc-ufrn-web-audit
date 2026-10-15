# Esqueleto do artigo (e de onde vem cada parte)

Formato sugerido: artigo curto estilo SBC (ex.: WebMedia / SBSI / ERES / WTDI) — confirmar com o orientador.

1. **Introdução** — problema (portais públicos, eMAG, Lei 13.146), lacuna, RQ1–RQ3, contribuições.
   Contribuições prováveis: (a) diagnóstico de ~N sites da UFRN; (b) índice de semântica
   reprodutível; (c) pipeline aberto regras+LLM com validação antes/depois.
2. **Fundamentação e trabalhos relacionados** — HTML semântico (WHATWG, WAI-ARIA, WCAG 2.2, eMAG),
   Lighthouse/Core Web Vitals, estudos de avaliação de portais .gov.br e universidades.
3. **Método** — corpus (ADR 001/002, funil), coleta (ambiente, data, hashes), métricas e índice (ADR 003),
   recomendação (catálogo de regras, prompt versionado), validação (ADR 004).
4. **Resultados** — RQ1 (diagnóstico, figuras do notebook), RQ2 (correlações), RQ3 (deltas, Wilcoxon).
5. **Discussão** — implicações para a STI/UFRN, onde regras bastam vs. onde precisa de LLM.
6. **Ameaças à validade** — tabela de `rastreabilidade.md`.
7. **Conclusão e trabalhos futuros** — CI/CD com PR automático (escopo do TCC 1), páginas internas.
8. **Disponibilidade dos dados** — link do repositório + tag v1.0 + hash dos dados brutos.
9. **Declaração de uso de IA** — `declaracao-uso-ia.md`.
