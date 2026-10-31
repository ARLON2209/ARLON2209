# Rastreamento próprio de WhatsApp

Sistema próprio para saber **de qual anúncio (Meta ou Google) veio cada conversa de WhatsApp** dos clientes da agência (negócios locais), e depois devolver essas conversões para o Meta e o Google otimizarem.

## Como funciona

```
Anúncio (UTM + gclid/fbclid)
   → site do cliente com o script t.js (guarda a origem por 30 dias)
   → botão de WhatsApp passa por  track.SEUDOMINIO/w/<link>
   → o clique é gravado com a origem e ganha um código curto (ex.: K7P2M)
   → WhatsApp abre com a mensagem:  "Olá! Quero um orçamento.  (cód. K7P2M)"
   → [Semana 2] a conversa é ligada ao clique pelo código
   → [Semana 3] Lead / Venda volta para Meta (CAPI) e Google (conversão offline)
   → [Semana 4] painel: custo por conversa, por orçamento e por venda
```

## Roteiro (4 semanas)

| Semana | Entrega | Status |
|---|---|---|
| 1 | Coletor + banco, script do site, links de rastreio de WhatsApp com código, UTMs padronizadas | **Pronto (código)**. Falta publicar |
| 2 | Ligar conversa ao clique: mini-CRM (conversa → orçamento → venda) e leitura do código | A fazer |
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
| GET | `/health` | Verificação de saúde |

## Desenvolvimento

```bash
npm install
DATABASE_URL=postgres://... ADMIN_TOKEN=dev npm start
DATABASE_URL=postgres://... npm test   # apaga e recria as tabelas: use um banco de teste
```

## Dados pessoais (LGPD)
O sistema grava IP, navegador, origem e cliques. Até a Semana 4 (banner de consentimento e prazo de retenção), avise na política de privacidade do site do cliente que há medição de origem de contatos.
