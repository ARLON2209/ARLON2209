# ConfirmDialog

O último passo antes de qualquer alteração na conta: lista cada mudança com onde, antes e depois. É a versão visual do "posso aplicar?" que o terminal pergunta.

- Título diz a ação ("Aplicar 2 alterações"). `note` para efeitos colaterais.
- `destructive` para pausar/remover em massa (botão `danger`).
- `onConfirm` é o único lugar que chama as ferramentas de edição do MCP.
