# Roteiro de sessões com o Claude Code

Cada sessão é **uma tarefa pequena**, com prompt pronto para colar, critério de pronto
e o que ela alimenta no texto do TCC/artigo. Faça em ordem; marque em `docs/STATUS.md`.

**Ritual de toda sessão**

1. Abrir o Claude Code na raiz do repo. Primeira mensagem: o prompt da sessão.
2. O Claude propõe um plano curto → você aprova/ajusta.
3. Implementa + testes (`npm test` verde).
4. Você revisa o diff (anote o que aceitou, alterou e rejeitou — isso é dado do TCC).
5. `/fim-de-sessao` → revisa o rascunho do diário → commit.
6. Se surgiu uma escolha questionável pela banca → `/adr <título>`.

---

## Cronograma recalibrado (hoje: 15/out)

O plano original previa a coleta congelada em 12/out e o código em 2/nov. Se o repo
está começando agora, esta é a versão comprimida. **Ajuste com o orientador.**

| Semana | Período | Sessões | Marco |
|---|---|---|---|
| A | 15–19 out | S00–S04 | `v0.1-triagem`, corpus.csv |
| B | 20–26 out | S05–S08 | Coleta completa (noturna) + congelada |
| C | 27 out–2 nov | S09–S13 | `v0.2-analise`, dataset.csv, panorama |
| D | 3–9 nov | S14–S16 | `v0.3-recomendacao` |
| E | 10–16 nov | S17–S18 | `v1.0`, código congelado |
| F | 17–23 nov | S19 + escrita | Versão final |

Ordem de cortes se atrasar (do plano): vnu e axe-core → validação com 5 sites →
LLM vira trabalho futuro. **Nunca cortar coleta nem diagnóstico.**

---

## Fase 0 — Fundação

### S00 · Esqueleto do projeto TypeScript
**Prompt:**
> Leia o CLAUDE.md. Configure o projeto: package.json (ESM, scripts triage/collect/analyze/recommend/validate/report/test rodando com tsx), tsconfig strict, vitest. Crie em `src/shared/`: `types.ts` (tipos de CorpusEntry, SiteMetrics, Rule, Recommendation — rascunho), `meta.ts` (função que devolve `{generatedAt, toolVersions, gitCommit}`), `logger.ts` (JSON lines em logs/), `http.ts` (cliente fetch com User-Agent do CLAUDE.md, timeout, limitador por host com p-limit: máx 2 hosts simultâneos e 2 s entre requisições ao mesmo host). Teste unitário do limitador. Não implemente módulos ainda.

**Pronto quando:** `npm test` passa; `npm run triage` existe (mesmo vazio).
**Alimenta:** Cap. 5 (arquitetura), Metodologia (cuidados éticos — o limitador é evidência).

### S01 · Registro do ambiente
**Prompt:**
> Crie `scripts/env-info.ts` que grava `docs/ambiente/ambiente-<data>.json` com: SO, CPU, RAM, versões de Node, Chrome/Chromium, Lighthouse, Playwright, Java (se houver). Adicione script `npm run env`. Esse arquivo vai para a Metodologia.

**Pronto quando:** arquivo gerado e commitado.
**Alimenta:** Metodologia (ambiente experimental) — a banca vai perguntar.

---

## Fase 1 — Triagem (módulo 0)

### S02 · Normalização da lista
**Prompt:**
> Implemente `src/triage/normalize.ts` (funções puras): ler `data/input/registros-ufrn.txt`; normalizar caixa e espaços; unificar `www.`/sem `www.` e `.ufrn.edu.br`/`.ufrn.br`; corrigir domínios duplicados tipo `www.cbeqimat.ufrn.br.ufrn.br`; remover infraestrutura e homologação por lista de padrões configurável (dns, ldap, mta, api, hml, homolog, teste, staging, grafana, portainer…). Cada descarte registra o motivo. Testes com casos reais da lista. Gere `data/interim/normalized.csv` e imprima o funil (linhas → únicos → unificados → após filtro).

**Pronto quando:** funil bate com o plano (1.290 → 1.288 → ~1.092 → ~1.000) ou diferenças explicadas no diário.
**Alimenta:** Metodologia (construção do corpus), tabela do funil.

### S03 · Verificação DNS + HTTP + robots
**Prompt:**
> Implemente `src/triage/probe.ts`: para cada domínio normalizado, resolver DNS, tentar https e depois http, seguir redirects (registrar cadeia), checar status e Content-Type, ler robots.txt. Aplicar critérios de inclusão/exclusão do ADR 002 e gravar o motivo de exclusão (dns, timeout, 4xx, 5xx, nao-html, login, pagina-padrao, duplicata-redirect, robots). Detecção de login: SIGAA/SIPAC/SIGRH e formulários de senha. Página padrão: "It works!", Apache/Nginx default. Usar o cliente http compartilhado. Opção `--limit`. Testes com respostas simuladas.

**Pronto quando:** roda em `--limit 30` sem erro; motivos de exclusão aparecem no CSV.
**Alimenta:** Metodologia (critérios), Resultados (funil final com N incluídos).

### S04 · Classificação e corpus.csv
**Prompt:**
> Implemente `src/triage/classify.ts`: detectar tecnologia (meta generator, wp-content, Joomla, Drupal, frameworks JS, HTML estático) e tipo de site (portal de unidade, departamento, pós-graduação, evento, laboratório, projeto) por heurística de hostname + title. Tipo não identificado = `outro` (não chutar). Gerar `data/corpus.csv` com: id, url_original, url_final, status, incluido, motivo_exclusao, tipo, tecnologia, data_triagem. Gerar `docs/resultados/triagem.md` com o funil e contagens por tipo/tecnologia. Rode no corpus inteiro.

**Pronto quando:** corpus.csv commitado (`data(triage): corpus de <data>`), tag `v0.1-triagem`.
**Alimenta:** Resultados (caracterização do corpus). Revise manualmente ~30 classificações e registre a taxa de acerto no diário — isso valida a heurística.

---

## Fase 2 — Coleta (módulo 1)

### S05 · HTML bruto + DOM renderizado
**Prompt:**
> Implemente `src/collect/page.ts`: para cada site incluído, salvar em `data/raw/<id>/`: `index.html` (resposta HTTP bruta), `rendered.html` (Playwright, após networkidle com timeout), `screenshot.png` (viewport mobile), `page.har`, `collect.json` (meta + timings + erros). Piloto: `npm run collect -- --limit 10 --only page`.

**Pronto quando:** 10 pastas completas; inspecione 2 manualmente.

### S06 · Lighthouse 3× com mediana
**Prompt:**
> Implemente `src/collect/lighthouse.ts`: rodar Lighthouse (API Node + chrome-launcher), perfil mobile padrão, categorias performance/accessibility/best-practices/seo, 3 execuções sequenciais por URL salvando `lh1.json..lh3.json`. Registrar versões. Rodar sequencialmente (um Chrome por vez) para não contaminar medições. Piloto com os mesmos 10 sites e reportar a variação (desvio) da nota de performance entre as 3 execuções.

**Pronto quando:** piloto ok; variação anotada no diário (vai para a seção de ameaças à validade).

### S07 · Orquestração retomável
**Prompt:**
> Crie `src/collect/index.ts` que orquestra page + lighthouse para todo o corpus, pulando sites já completos (retomável após queda), com log de progresso e resumo final (ok/falhas por motivo). Adicione `npm run collect -- --resume`. Documente no README como rodar de madrugada (nohup/tmux).

### S08 · Coleta completa e congelamento
*(sessão curta, mais operacional)*
> Avise a STI/SINFO antes (e-mail; guarde a cópia em `docs/ambiente/`).
> **Antes de rodar:** apague as pastas do piloto da S05 em `data/raw/` (10 sites + `creation.ufrn.br`, coletados com `gitDirty: true`) e confirme que o working tree está limpo, para a coleta oficial sair com `gitDirty: false`.
> **Prompt:** Rode a coleta completa com `--resume`. Ao final: gere `docs/resultados/coleta.md` (sucessos, falhas, duração), compacte `data/raw/` em .zip, calcule SHA-256 e grave em `docs/ambiente/hashes.md`.

**Pronto quando:** coleta congelada; a partir daqui **nunca mais** se coleta de novo.
**Alimenta:** Metodologia (data da coleta), Ameaças à validade.

---

## Fase 3 — Análise (módulo 2)

### S09 · Métricas de performance
**Prompt:**
> Implemente `src/analyze/performance.ts`: dos 3 JSONs do Lighthouse, extrair mediana de: nota de performance, accessibility, SEO, best-practices, LCP, CLS, TBT, FCP, Speed Index, peso total, nº de requisições, JS/CSS não usado; e lista de auditorias com falha. Testes com um JSON de fixture.

### S10 · Semântica (parte 1)
**Prompt:**
> Implemente em `src/analyze/semantics.ts` (sobre rendered.html, com cheerio), um arquivo de teste por indicador com fixtures: (1) proporção div+span / total; (2) landmarks header/nav/main/footer incluindo role equivalente, contagem de main; (3) hierarquia de títulos: nº de h1 e nº de saltos.

### S11 · Semântica (parte 2)
**Prompt:**
> Continue semantics.ts: (4) estrutura: article/section/aside/figure/ul/ol; (5) interativos falsos: div/span com onclick sem role nem tabindex; (6) metadados: lang, title, meta viewport, meta description; (7) img sem alt; (8) input sem label associado; (9) tags obsoletas (font, center, marquee, table de layout por heurística — documente a heurística). Validade HTML com vnu é opcional: deixe atrás de uma flag `--vnu`.

### S12 · Índice de semântica + dataset
**Prompt:**
> Antes de codar, rascunhe o ADR 003 (índice de semântica): fórmula, normalização 0–100 de cada indicador, pesos e justificativa (WHATWG, WAI-ARIA, WCAG 2.2, eMAG). Depois implemente `src/analyze/index.ts`: gera `metrics.json` por site e `data/processed/dataset.csv` com **todos os indicadores brutos + índice**. Inclua uma análise de sensibilidade: índice com pesos iguais vs. pesos propostos (correlação entre os dois rankings).

**Pronto quando:** dataset commitado, tag `v0.2-analise`.
**Alimenta:** Metodologia (o índice é contribuição do trabalho), defesa contra "por que esses pesos?".

### S13 · Relatórios e panorama
**Prompt:**
> Implemente `src/report/`: relatório HTML por site (notas, indicadores, auditorias com falha) e panorama geral. Crie `analysis/diagnostico.ipynb` (pandas) respondendo: quantos sites sem main nem nav; proporção média de div; correlação semântica × acessibilidade e × performance (Spearman, com p-valor); comparação por tecnologia (Kruskal-Wallis); top 10 auditorias que falham. Salve figuras em `docs/resultados/figuras/` e tabelas em CSV.

**Alimenta:** Capítulo de Resultados — diagnóstico (a parte que sozinha já sustenta o TCC).

---

## Fase 4 — Recomendação (módulo 3)

### S14 · Motor de regras + 3 regras
**Prompt:**
> Implemente o motor em `src/recommend/engine.ts` (aplica regras ao HTML, gera recommendations.json, fixed.html e fix.diff unificado). Implemente 3 regras, cada uma em um arquivo com teste: `html-lang` (adiciona lang="pt-BR"), `meta-viewport`, `img-dimensions` (width/height a partir do HAR/tamanho real). Cada recomendação: id, regra, severidade, dimensão (performance|semântica), evidência, correção automática (sim/não).

### S15 · Mais 3–5 regras
**Prompt:**
> Adicione regras: `img-lazy` (loading="lazy" fora da primeira dobra), `obsolete-tags` (center/font → CSS), `heading-skip` (apenas recomendação, sem correção automática), `fake-button` (div onclick → button), `render-blocking-hint` (defer em scripts não críticos, só recomendação). Testes para cada.

### S16 · LLM para landmarks
**Prompt:**
> Implemente `src/recommend/llm.ts` para um único caso: dado o HTML sem landmarks, propor qual div vira header/nav/main/footer. Prompt versionado em `docs/prompts/landmarks-v1.md` (com modelo, temperatura, data). Saída em JSON estruturado (seletor + elemento proposto + justificativa), nunca HTML livre. Validar: HTML resultante válido, mesmo texto visível (comparar textContent), screenshot comparado. Registrar tokens e custo. Teste com resposta mockada.

**Pronto quando:** tag `v0.3-recomendacao`.
**Alimenta:** Cap. 5 (módulo de recomendação), separação "LLM como componente".

---

## Fase 5 — Validação (módulo 4)

### S17 · Cópia local servível
**Prompt:**
> Implemente `src/validate/snapshot.ts`: salvar a página com recursos (Playwright, reescrita de URLs para caminhos locais). Servir original e corrigido com o mesmo servidor estático, em portas diferentes. Verificar visualmente que a cópia original renderiza igual ao screenshot da coleta. Documentar recursos que não puderam ser trazidos (limitação).

### S18 · Amostra e antes/depois
**Prompt:**
> Rascunhe o ADR 004 (seleção da amostra estratificada: 10–15 sites, piores notas, tipos e tecnologias diferentes). Depois implemente `src/validate/run.ts`: para cada site da amostra, Lighthouse 3× + semântica no original local e no corrigido local, gerando `validation.json` com deltas. Notebook `analysis/validacao.ipynb` com teste de Wilcoxon pareado e gráfico antes/depois.

**Pronto quando:** tag `v1.0`, código congelado.

---

## Fase 6 — Fechamento

### S19 · Pacote de reprodutibilidade
**Prompt:**
> Atualize o README com "como reproduzir" do zero. Verifique que `docs/artigo/rastreabilidade.md` tem todas as linhas preenchidas com links para arquivos reais. Liste ADRs, tags e entradas do diário em `docs/artigo/indice-evidencias.md`. Gere um resumo do uso do Claude a partir dos diários (nº de sessões, aceitos/alterados/rejeitados) para a seção de declaração de uso de IA.

---

## Fase 7 — Interface visual (depois do fechamento, fora do congelamento da `v1.0`)

Pedido do autor (2026-11-16): uma interface amigável para colar o link de um site
(da UFRN ou qualquer outro) e ver métricas, problemas e recomendações, ligada ao
sistema existente. Ela vem depois da S19 e não altera o código congelado na `v1.0`
nem os dados do TCC. Está dividida em 2 sessões pela regra "uma sessão = uma tarefa
pequena".

### S20 · Interface: ADR + serviço que roda o pipeline para uma URL
**Prompt:**
> Rascunhe o ADR 017 (interface visual). O ADR cobre:
> - análises avulsas gravadas em `data/avulsos/<site>/<data>/`, nunca no `dataset.csv`, no
>   `llm-runs.csv` do TCC nem em `data/raw/`;
> - as regras invioláveis 1–5 continuam valendo (robots, User-Agent, pausas, só a página
>   inicial e pública);
> - o LLM é opcional por análise, com o teto de gasto;
> - a ferramenta roda só localmente (`127.0.0.1`), e o ADR registra os riscos de
>   publicá-la (SSRF, abuso contra terceiros).
>
> Depois, implemente `src/ui/server.ts`: um servidor HTTP local que recebe uma URL,
> enfileira a análise (1 por vez) e roda triagem → coleta → análise → recomendação
> chamando os módulos existentes como processos filhos, sem reescrever a lógica. O
> servidor expõe o progresso por etapa (SSE) e serve os JSON resultantes. Para os sites
> do corpus, ele só lê `data/processed/` (sem nova coleta). Testes do servidor com os
> módulos mockados.

### S21 · Interface: telas
**Prompt:**
> Implemente a interface web (React + Vite, em `ui/`) consumindo o servidor da S20:
> - **campo de URL** com o progresso por etapa;
> - **painel do site**: índice composto e notas de performance e semântica, com os
>   indicadores brutos;
> - **recomendações** agrupadas por severidade, com motivo, referência e o diff de cada
>   correção (lado a lado);
> - **screenshots** antes × depois quando houver;
> - **lista dos sites da UFRN** do corpus, com filtro e ordenação.
>
> Os textos são em pt-BR e a interface deve ser acessível: ela também tem landmarks e
> títulos corretos, e passa no axe. O comando é `npm run ui`.

**Pronto quando:** tag `v1.1-interface`; demonstração gravada para a defesa.
**Alimenta:** apêndice ou seção "Ferramenta" do TCC; demonstração na banca.
