# Declaração de uso de IA (rascunho — finalizar na S19)

> Verificar se o curso/UFRN tem orientação formal sobre uso de IA em TCC.

Este trabalho usa modelos de linguagem em **dois papéis distintos**, tratados separadamente:

## 1. Ferramenta de desenvolvimento
O assistente Claude Code (Anthropic, modelo <preencher>) foi usado para gerar e revisar
código, testes e rascunhos de documentação técnica. Todo o código foi revisado pelo autor
antes do commit. O processo foi registrado em <N> entradas de diário (`docs/diario/`),
que documentam o que foi pedido e o que foi aceito, alterado ou rejeitado, com justificativa.
Commits com participação do assistente estão marcados com `Co-Authored-By`.

Resumo quantitativo (gerado na S19): <N sessões · X itens aceitos · Y alterados · Z rejeitados>.

## 2. Componente do sistema avaliado
No módulo de recomendação, um LLM (<modelo exato>) propõe a marcação de landmarks em casos
não cobertos pelas regras determinísticas. Os prompts estão versionados em `docs/prompts/`,
as saídas são validadas automaticamente (HTML válido, mesmo texto visível) e os resultados
(taxa de saídas válidas, custo, efeito nas métricas) são reportados no Capítulo de Resultados.

O texto do TCC <foi / não foi> redigido com auxílio de IA — <descrever, se aplicável>.
