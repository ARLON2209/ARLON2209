# Rastreamento próprio de WhatsApp

Sistema próprio para saber **de qual anúncio (Meta ou Google) veio cada conversa de WhatsApp** dos clientes da agência (negócios locais), e depois devolver essas conversões para o Meta e o Google otimizarem.

## Como funciona

```
Anúncio (UTM + gclid/fbclid)
   → site do cliente com o script t.js (guarda a origem por 30 dias)
   → botão de WhatsApp passa por  track.SEUDOMINIO/w/<link>
   → o clique é gravado com a origem e ganha um código curto (ex.: K7P2M)
   → WhatsApp abre com a mensagem:  "Olá! Quero um orçamento.  (cód. K7P2M)"
   → [Semana 2] o atendente cola a mensagem no mini-CRM: a conversa é ligada ao clique pelo código
   → [Semana 3] Lead / Venda volta para Meta (CAPI) e Google (conversão offline)
   → [Semana 4] painel: custo por conversa, por orçamento e por venda
```

## Roteiro (4 semanas)

| Semana | Entrega | Status |
|---|---|---|
| 1 | Coletor + banco, script do site, links de rastreio de WhatsApp com código, UTMs padronizadas | **Pronto (código)**. Falta publicar |
| 2 | Mini-CRM: conversa ligada ao clique pelo código, etapas conversa → orçamento → venda, resumo por origem | **Pronto (código)** |
| 3 | Meta Conversions API e Google Ads (conversões offline por gclid), com deduplicação | A fazer |
| 4 | Tela no painel de tráfego (gasto × conversas × vendas), LGPD e alertas | A fazer |

---

## Semana 1: colocar no ar (passo a passo)

### 1. Banco de dados
Crie um Postgres gratuito no **Neon** (neon.tech) ou no **Supabase**. Copie a *connection string* (`postgres://...`).

### 2. Servidor
Publique esta pasta (`rastreamento/`) no **Railway** ou no **Render**:
- Comando de início: `npm start`
- Variáveis de ambiente (veja `.env.example`):
  - `DATABASE_URL`: a connection string do passo 1
  - `ADMIN_TOKEN`: uma senha longa e aleatória (por exemplo, `openssl rand -hex 32`)
- As tabelas são criadas automaticamente na primeira inicialização.
- Teste: `https://<seu-app>/health` deve responder `{"ok":true}`.

### 3. Subdomínio
No DNS do seu domínio, crie `track.SEUDOMINIO.com.br` como **CNAME** apontando para o endereço do Railway ou do Render e adicione o domínio personalizado no painel deles (o HTTPS é automático).

### 4. Cadastrar o cliente e os links
```bash
export API=https://track.SEUDOMINIO.com.br
export TOKEN=<ADMIN_TOKEN>

# Cliente
curl -X POST $API/admin/clients -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"slug":"butzke","name":"Butzke Esquadrias de PVC","whatsapp_phone":"5547XXXXXXXXX"}'

# Links de rastreio (um por origem)
curl -X POST $API/admin/links -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"client":"butzke","slug":"butzke-site","name":"Site – botão WhatsApp","channel":"outro","message":"Olá! Vim pelo site e quero um orçamento de esquadrias de PVC."}'

curl -X POST $API/admin/links -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"client":"butzke","slug":"butzke-insta-bio","name":"Instagram – Bio","channel":"organico","message":"Olá! Vi o Instagram de vocês e quero um orçamento."}'

curl -X POST $API/admin/links -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"client":"butzke","slug":"butzke-gmn","name":"Google Meu Negócio","channel":"organico","message":"Olá! Encontrei vocês no Google e quero um orçamento."}'
```

### 5. Instalar o script no site do cliente
Antes de `</body>` (ou pelo GTM, numa tag HTML personalizada):
```html
<script async src="https://track.SEUDOMINIO.com.br/t.js" data-client="butzke" data-wa="butzke-site"></script>
```
Com `data-wa`, **todos os botões de WhatsApp do site** (wa.me, api.whatsapp.com) passam automaticamente pelo link de rastreio. Não precisa editar os botões.

### 6. UTMs nos anúncios
**Google Ads**: marcação automática ligada e, em Configurações da campanha → Opções de URL → Sufixo do URL final:
```
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}
```
**Meta Ads** (anúncios com destino ao site), em Parâmetros de URL:
```
utm_source=meta&utm_medium={{placement}}&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}
```
> Anúncios de clique para WhatsApp do Meta (sem site) não passam pelo link. Eles serão rastreados na Semana 2, pela origem do anúncio que o próprio WhatsApp informa (WhatsApp API oficial ou Criativivo).

### 7. Testar
1. Abra o site com `?utm_source=teste&gclid=TESTE123`, clique no botão de WhatsApp e confira o código no fim da mensagem.
2. Consulte:
```bash
curl -H "authorization: Bearer $TOKEN" "$API/admin/clicks?client=butzke"
curl -H "authorization: Bearer $TOKEN" "$API/admin/clicks/K7P2M"
```

---

## Semana 2: mini-CRM (opção A)

Tela para o atendente do cliente registrar cada conversa e acompanhar até a venda: `https://track.SEUDOMINIO.com.br/crm` (feita para usar no celular).

### Liberar o acesso de um cliente
```bash
curl -X POST $API/admin/clients/butzke/crm-key -H "authorization: Bearer $TOKEN"
```
A resposta traz a `crm_key`. **Ela aparece só nessa hora** (o banco guarda apenas o hash). Envie para o responsável da Butzke por um canal privado. Para trocar a chave (por exemplo, quando um funcionário sai), rode o mesmo comando: a chave antiga deixa de funcionar.

### Rotina do atendente
1. Chegou conversa nova no WhatsApp → abre o CRM → **+ Novo lead**.
2. **Cola a 1ª mensagem** do cliente. Se tiver `(cód. XXXXX)`, o CRM mostra na hora a origem (Google, campanha, palavra-chave).
3. Sem código (por exemplo, anúncio de clique para WhatsApp do Meta, que mostra "Vi seu anúncio" na conversa), o atendente escolhe **De onde veio?** e, se souber, o anúncio.
4. Informa telefone e nome → **Salvar**.
5. Conforme a negociação anda: **→ Orçamento**, **→ Venda** (pede o valor) ou **→ Perdido**.

Regras:
- Um lead por telefone. Se o mesmo número chegar de novo, os dados são atualizados (não duplica).
- Origem vinda do código é **rastreada** e não pode ser trocada à mão. Um código novo sempre substitui uma origem informada manualmente.
- Cada mudança de etapa fica registrada em `lead_events`, que é a base do envio de Lead e Venda ao Meta e ao Google na Semana 3.
- No topo da tela fica o resumo dos últimos 30 dias por origem: leads, vendas e receita.

---

## Endpoints

| Método | Caminho | Uso |
|---|---|---|
| GET | `/t.js` | Script do site |
| POST | `/collect` | Eventos do site (PageView, Contact...) |
| GET | `/w/:slug` | Link de rastreio: grava o clique e abre o WhatsApp com código |
| POST | `/admin/clients` | Cadastra/atualiza cliente (Bearer `ADMIN_TOKEN`) |
| POST | `/admin/links` | Cadastra/atualiza link de rastreio |
| GET | `/admin/clicks?client=` | Últimos cliques para o WhatsApp |
| GET | `/admin/clicks/:code` | Origem de um código visto na conversa |
| POST | `/admin/clients/:slug/crm-key` | Gera/troca a chave do mini-CRM do cliente |
| GET | `/crm` | Tela do mini-CRM |
| GET/POST/PATCH | `/api/crm/...` | API do mini-CRM (cabeçalho `x-crm-key`): `me`, `code/:code`, `leads`, `leads/:id`, `summary` |
| GET | `/health` | Verificação de saúde |

## Desenvolvimento

```bash
npm install
DATABASE_URL=postgres://... ADMIN_TOKEN=dev npm start
DATABASE_URL=postgres://... npm test   # apaga e recria as tabelas: use um banco de teste
```

## Dados pessoais (LGPD)
O sistema grava IP, navegador, origem e cliques. Até a Semana 4 (banner de consentimento e prazo de retenção), avise na política de privacidade do site do cliente que há medição de origem de contatos.
