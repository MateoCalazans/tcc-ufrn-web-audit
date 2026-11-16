# Catálogo de regras de recomendação

Preenchido pelo comando `/nova-regra`. Entra como tabela no Cap. 5. Decisões: ADR 014
(motor e regras da S14) e ADR 015 (regras da S15, critério de escolha e severidades).

| id | Dimensão | Severidade | Correção automática | Detecta | Evidência / frequência (conjunto principal, n = 217) | Referência normativa |
|---|---|---|---|---|---|---|
| `html-lang` | semântica | alta (ausente/vazio) · media (inválido) · info (outro idioma) | sim, `lang="pt-BR"` quando ausente/vazio | `<html>` sem `lang` válido | `html-has-lang` 21,7% | WHATWG `lang` / BCP 47; WCAG 3.1.1 |
| `meta-viewport` | performance | alta (ausente) · media (zoom bloqueado) · baixa/media (largura fixa) | sim, quando ausente (depois do charset) | viewport ausente, largura fixa ou zoom bloqueado | `viewport-insight` 13,4%; `meta-viewport` 5,5% | WCAG 1.4.4 (zoom) |
| `img-dimensions` | performance | media | sim, dimensões intrínsecas do HAR | `<img>` sem `width`/`height` | `unsized-images` 72,8% | web.dev, CLS |
| `img-lazy` | performance | baixa | sim, `loading="lazy"` a partir da 4ª `<img>`, exceto a LCP | imagem provavelmente fora da primeira dobra sem `loading` | não medida (sem auditoria no Lighthouse 13) | WHATWG `loading`; web.dev, lazy loading |
| `obsolete-tags` | semântica | baixa | só `<font>` com `color`/`face` válidos → `<span style>` | elementos obsoletos (`OBSOLETAS_WHATWG`) | 1,8% (`obsoletas_whatwg > 0`) | WHATWG §16.2 (Non-conforming features) |
| `heading-skip` | semântica | media | não | salto de nível ao descer na hierarquia de títulos (ADR 010) | 28,6% (`titulos_saltos > 0`); `heading-order` 25,8% | WCAG 1.3.1 / técnica G141; eMAG 3.1 |
| `fake-button` | semântica | media | não | `div`/`span` com `onclick`, sem `role` e `tabindex` (ADR 011) | 2,3% (`interativos_falsos > 0`) | WCAG 2.1.1 e 4.1.2 |
| `render-blocking-hint` | performance | media | não | `<script src>` sem `async`/`defer` listado na `render-blocking-insight` | `render-blocking-insight` 83,4% | Lighthouse, `render-blocking-insight` |

As referências normativas foram citadas de memória: conferir antes do texto final.
As frequências das auditorias vêm de `docs/resultados/tabelas/auditorias_falha.csv` (S13).
As dos indicadores vêm do `data/processed/dataset.csv` (S12), contadas com pandas na S15.
