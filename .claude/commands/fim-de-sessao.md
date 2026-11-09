---
description: Rascunha a entrada do diário e atualiza o STATUS ao fim da sessão
---
Estamos encerrando a sessão de trabalho. Faça, nesta ordem:

1. Rode `git log --oneline` desde o último registro em `docs/diario/` e `git status`.
2. Crie `docs/diario/<data de hoje>-<SNN>.md` seguindo **exatamente** `docs/diario/_modelo.md`.
   - Na tabela "Avaliação do que o Claude produziu", liste o que você gerou nesta sessão
     e **sempre preencha** as colunas **Decisão** e **Motivo** (nunca `?`): use o que o autor
     disse na conversa (aceitou/alterou/rejeitou, citando a frase); "Alterado" se houve
     correção durante a sessão; sem sinal do autor, a melhor inferência marcada "(inferido)".
   - **Sempre preencha a Duração** (nunca `~<h>`): estime pelos horários dos commits
     (`git log --format="%h %ad" --date=format:%H:%M`) e cite a fonte.
   - Em "Resultados", só números que vieram de comandos executados nesta sessão, com o comando.
   - Se houve decisão metodológica sem ADR, aponte isso em "Decisões tomadas".
3. Atualize a linha da sessão em `docs/STATUS.md` e o campo "Próxima sessão".
4. Se alguma linha de `docs/artigo/rastreabilidade.md` ganhou evidência nova, atualize a coluna Evidência.
5. Mostre um resumo e **não faça commit**: o autor revisa antes. $ARGUMENTS
