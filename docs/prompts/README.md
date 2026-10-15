# Prompts do LLM (componente do sistema — módulo 3)

Estes prompts **são parte do sistema avaliado**, não do processo de desenvolvimento.
Nunca editar um prompt já usado em resultados: criar nova versão (`-v2.md`).

Cada arquivo traz no topo:
```
modelo: <id exato do modelo>
temperatura: <valor>
max_tokens: <valor>
data: AAAA-MM-DD
usado_em: <commits/execuções>
```
Depois: prompt de sistema, prompt do usuário (com placeholders), esquema JSON de saída
e 1–2 exemplos de entrada/saída.

Resultados por execução (tokens, custo, taxa de saídas válidas) vão em
`data/processed/llm-runs.csv`.
