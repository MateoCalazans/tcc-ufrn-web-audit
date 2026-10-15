---
description: Implementa uma regra de recomendação com teste
argument-hint: <nome-da-regra> <descrição>
---
Implemente a regra `$ARGUMENTS` no módulo 3:
1. Fixture de entrada em `tests/fixtures/rules/<nome>/input.html` e saída esperada.
2. Teste em `tests/rules/<nome>.test.ts` escrito **antes** da implementação; rode e mostre que falha.
3. Implementação em `src/recommend/rules/<nome>.ts` seguindo a interface `Rule`.
4. Rode `npm test` até passar. Registre a regra no catálogo `src/recommend/rules/index.ts`.
5. Atualize a tabela de regras em `docs/artigo/catalogo-regras.md` (id, dimensão, severidade, correção automática?, referência normativa).
