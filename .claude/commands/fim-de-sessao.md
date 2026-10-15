---
description: Rascunha a entrada do diário e atualiza o STATUS ao fim da sessão
---
Estamos encerrando a sessão de trabalho. Faça, nesta ordem:

1. Rode `git log --oneline` desde o último registro em `docs/diario/` e `git status`.
2. Crie `docs/diario/<data de hoje>-<SNN>.md` seguindo **exatamente** `docs/diario/_modelo.md`.
   - Na tabela "Avaliação do que o Claude produziu", liste o que você gerou nesta sessão
     e deixe a coluna **Decisão** e **Motivo** como `?` para o autor preencher,
     a menos que ele já tenha dito na conversa o que aceitou/alterou/rejeitou.
   - Em "Resultados", só números que vieram de comandos executados nesta sessão, com o comando.
   - Se houve decisão metodológica sem ADR, aponte isso em "Decisões tomadas".
3. Atualize a linha da sessão em `docs/STATUS.md` e o campo "Próxima sessão".
4. Se alguma linha de `docs/artigo/rastreabilidade.md` ganhou evidência nova, atualize a coluna Evidência.
5. Mostre um resumo e **não faça commit**: o autor revisa antes. $ARGUMENTS
