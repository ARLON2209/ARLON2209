# BudgetEditor

Editor de orçamento diário de uma campanha ou conjunto: campo em R$, atalhos +10/+20/+50%, e a diferença *antes → depois* em tempo real.

- Aumento acima de 30% mostra aviso de fase de aprendizado.
- O botão é **Revisar alteração**: `onSave` deve abrir o `ConfirmDialog`, não chamar a API.
