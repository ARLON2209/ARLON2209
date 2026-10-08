# CampaignTable

Lista de campanhas de uma conta com toggle de veiculação, orçamento, gasto, resultados e CPA (calculado = gasto ÷ resultados).

- Números alinhados à direita em mono. A linha recém-alterada fica com `edited` (fundo `accent-tint`) até o próximo carregamento.
- `onToggle` e `onEditBudget` devem abrir `ConfirmDialog` / `BudgetEditor`, nunca aplicar direto.
