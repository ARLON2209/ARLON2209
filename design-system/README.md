# Painel de Tráfego

A versão visual da conversa no terminal: as mesmas contas de anúncio do Meta (via MCP), as mesmas consultas e as mesmas edições — pausar, ativar, mudar orçamento — só que em telas.

## Princípios

1. **Ver antes de mudar.** Toda edição mostra *antes → depois* e pede confirmação (`ConfirmDialog`). É a mesma regra que seguimos no terminal: nada é alterado na conta sem um "sim".
2. **Número é protagonista.** Valores em `mono` (família `--font-mono`), alinhados à direita, com o rótulo pequeno acima (estilo `label`). Variação sempre com sinal e seta: `▲ 12,4%`.
3. **Status nunca só por cor.** Todo selo tem texto ("Ativa", "Pausada", "Sem saldo") e um ponto; verde e vermelho diferem também em claridade.
4. **A conversa continua aqui.** O `CommandBar` aceita os mesmos pedidos em português que você digita hoje ("pausar campanha X", "saldo de todas as contas") e o histórico aparece como `ChatMessage`.

## Voz e conteúdo

- Português do Brasil, direto, sem jargão desnecessário. Verbos no infinitivo nos botões: **Pausar**, **Ativar**, **Salvar orçamento**.
- Moeda sempre `R$ 1.234,56`; porcentagem `12,4%`; datas `08/10` ou `08 out`.
- Siglas de mídia ficam como o mercado usa: CPA, CPM, CTR, ROAS.
- IDs de conta aparecem completos em `data` / `ink-muted`: `act_1029384756`.
- Mensagens de confirmação dizem o efeito: "Isso vai pausar 3 anúncios agora." — nunca "Tem certeza?".

## Fundamentos visuais

- **Tema escuro é o padrão** (`bg-000` #0b0d10), herdado da tela preta; o tema claro existe para relatórios e apresentação ao cliente.
- **Superfícies em camadas, não sombras:** `bg-000` → `bg-100` (cards) → `bg-200` (campos, hover). Cards têm borda `line` 1px e `radius-lg`. `shadow-pop` só no que flutua.
- **Verde terminal (`accent`)** é a única cor de marca: ação principal, foco e "Ativa". `info`, `warn` e `danger` são semânticas — nunca decoração.
- **Grade de 4px:** `space-1` a `space-8`. Cards com padding `space-4`, seções separadas por `space-6`.
- **Tipografia:** Inter para interface, JetBrains Mono para números, IDs e comandos.

## Telas previstas

| Tela | Componentes |
|---|---|
| Visão geral | `AppNav`, `KpiCard` ×4, `AccountCard` (grade), `CommandBar` |
| Conta | `KpiCard`, `CampaignTable` com `Toggle` e `StatusBadge` |
| Editar orçamento | `BudgetEditor` → `ConfirmDialog` |
| Assistente | `ChatMessage` + `CommandBar` (o terminal, em tela) |

O card **TelaVisaoGeral** mostra essas peças montadas numa tela inteira.

## Iconografia

Sem pacote de ícones por enquanto: setas `▲ ▼`, ponto de status `●` e o prompt `›` são tipográficos. Se adotar uma biblioteca, use traço de 1,5px, 16px, cor `currentColor` do texto ao lado.

## Fonte dos dados

Os exemplos usam contas e números fictícios. Na implementação, os dados vêm das ferramentas do MCP do Meta (contas, campanhas, insights) e as edições chamam as ferramentas de atualização somente depois do `ConfirmDialog`.
