// Testes do mini-CRM (Semana 2). Precisam de um Postgres: DATABASE_URL=postgres://... npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { createPool, migrate } from '../src/db.js';
import { extractCode, normalizePhone } from '../src/crm.js';

const TOKEN = 'token-de-teste-123';
const auth = { authorization: `Bearer ${TOKEN}` };
let pool, app, key, otherKey;
const crm = (k = key) => ({ 'x-crm-key': k });

async function codeFromClick(url) {
  const r = await app.inject({ method: 'GET', url });
  return new URL(r.headers.location).searchParams.get('text').match(/cód\. (\w{5})/)[1];
}

before(async () => {
  pool = createPool(process.env.DATABASE_URL);
  await pool.query('DROP TABLE IF EXISTS lead_events, leads, wa_clicks, events, touchpoints, visitors, tracking_links, clients CASCADE');
  await migrate(pool);
  await migrate(pool);
  app = buildApp({ pool, adminToken: TOKEN, logger: false });
  await app.ready();
  for (const [slug, phone] of [['butzke', '5547999990000'], ['outro', '5547888880000']]) {
    await app.inject({ method: 'POST', url: '/admin/clients', headers: auth, payload: { slug, name: slug, whatsapp_phone: phone } });
    await app.inject({ method: 'POST', url: '/admin/links', headers: auth,
      payload: { client: slug, slug: `${slug}-site`, name: 'Site', channel: 'outro', message: 'Olá!' } });
  }
  key = (await app.inject({ method: 'POST', url: '/admin/clients/butzke/crm-key', headers: auth })).json().crm_key;
  otherKey = (await app.inject({ method: 'POST', url: '/admin/clients/outro/crm-key', headers: auth })).json().crm_key;
});
after(async () => { await app.close(); await pool.end(); });

test('utilitários: código e telefone', () => {
  assert.equal(extractCode('Olá! Quero orçamento.\n\n(cód. k7p2m)'), 'K7P2M');
  assert.equal(extractCode('COD: AB2CD'), 'AB2CD');
  assert.equal(extractCode('ab2cd'), 'AB2CD');
  assert.equal(extractCode('oi, tudo bem?'), null);
  assert.equal(normalizePhone('(47) 99999-0000'), '5547999990000');
  assert.equal(normalizePhone('+55 47 3333-0000'), '554733330000');
  assert.equal(normalizePhone('123'), null);
});

test('CRM exige chave válida e a página é servida', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/api/crm/me' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/api/crm/me', headers: crm('x'.repeat(32)) })).statusCode, 401);
  const me = await app.inject({ method: 'GET', url: '/api/crm/me', headers: crm() });
  assert.equal(me.json().slug, 'butzke');
  const page = await app.inject({ method: 'GET', url: '/crm' });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Leads WhatsApp/);
  // a chave é guardada só como hash
  const { rows } = await pool.query("SELECT crm_key_hash FROM clients WHERE slug = 'butzke'");
  assert.notEqual(rows[0].crm_key_hash, key);
});

test('lead com código herda a origem do clique (Google)', async () => {
  const code = await codeFromClick('/w/butzke-site?gclid=G1&utm_source=google&utm_campaign=pesquisa-vale-itajai&utm_term=janela+pvc');
  const pv = await app.inject({ method: 'GET', url: `/api/crm/code/${code}`, headers: crm() });
  assert.equal(pv.json().origin, 'google');

  const r = await app.inject({ method: 'POST', url: '/api/crm/leads', headers: crm(),
    payload: { phone: '47 98888-1111', name: 'Maria', code: `Olá! (cód. ${code})` } });
  assert.equal(r.statusCode, 201);
  const lead = r.json();
  assert.equal(lead.origin, 'google');
  assert.equal(lead.origin_source, 'codigo');
  assert.equal(lead.campaign, 'pesquisa-vale-itajai');
  assert.equal(lead.utm_term, 'janela pvc');
  assert.equal(lead.phone, '5547988881111');
});

test('código de outro cliente não é aceito', async () => {
  const code = await codeFromClick('/w/outro-site?fbclid=F1');
  const r = await app.inject({ method: 'POST', url: '/api/crm/leads', headers: crm(), payload: { phone: '47977770000', code } });
  assert.equal(r.statusCode, 404);
  const ok = await app.inject({ method: 'POST', url: '/api/crm/leads', headers: crm(otherKey), payload: { phone: '47977770000', code } });
  assert.equal(ok.json().origin, 'meta');
});

test('lead manual, depois o mesmo telefone chega com código: o código vence', async () => {
  const a = await app.inject({ method: 'POST', url: '/api/crm/leads', headers: crm(),
    payload: { phone: '47966660000', origin: 'meta', campaign: 'vídeo janela' } });
  assert.equal(a.statusCode, 201);
  assert.equal(a.json().origin_source, 'manual');
  const code = await codeFromClick('/w/butzke-site?utm_source=google&gclid=G2&utm_campaign=c2');
  const b = await app.inject({ method: 'POST', url: '/api/crm/leads', headers: crm(), payload: { phone: '5547966660000', code } });
  assert.equal(b.statusCode, 200);
  assert.equal(b.json().created, false);
  assert.equal(b.json().origin, 'google');
  assert.equal(b.json().campaign, 'c2');
  // origem rastreada não pode ser trocada à mão
  const c = await app.inject({ method: 'PATCH', url: `/api/crm/leads/${b.json().id}`, headers: crm(), payload: { origin: 'meta' } });
  assert.equal(c.statusCode, 409);
});

test('etapas: orçamento -> venda exige valor e grava histórico', async () => {
  const lead = (await app.inject({ method: 'POST', url: '/api/crm/leads', headers: crm(),
    payload: { phone: '47955550000', origin: 'meta' } })).json();
  const o = await app.inject({ method: 'PATCH', url: `/api/crm/leads/${lead.id}`, headers: crm(), payload: { stage: 'orcamento' } });
  assert.equal(o.json().stage, 'orcamento');
  const semValor = await app.inject({ method: 'PATCH', url: `/api/crm/leads/${lead.id}`, headers: crm(), payload: { stage: 'venda' } });
  assert.equal(semValor.statusCode, 400);
  const v = await app.inject({ method: 'PATCH', url: `/api/crm/leads/${lead.id}`, headers: crm(), payload: { stage: 'venda', value: '12.500,90' } });
  assert.equal(v.statusCode, 200);
  assert.equal(Number(v.json().value), 12500.9);
  const bad = await app.inject({ method: 'PATCH', url: `/api/crm/leads/${lead.id}`, headers: crm(), payload: { stage: 'xyz' } });
  assert.equal(bad.statusCode, 400);

  const { rows } = await pool.query('SELECT stage, value FROM lead_events WHERE lead_id = $1 ORDER BY id', [lead.id]);
  assert.deepEqual(rows.map((r) => r.stage), ['conversa', 'orcamento', 'venda']);
  assert.equal(Number(rows[2].value), 12500.9);

  // outro cliente não enxerga nem altera
  const x = await app.inject({ method: 'PATCH', url: `/api/crm/leads/${lead.id}`, headers: crm(otherKey), payload: { stage: 'perdido' } });
  assert.equal(x.statusCode, 404);
});

test('lista, busca e resumo por origem', async () => {
  const all = (await app.inject({ method: 'GET', url: '/api/crm/leads', headers: crm() })).json();
  assert.equal(all.length, 3);
  const vendas = (await app.inject({ method: 'GET', url: '/api/crm/leads?stage=venda', headers: crm() })).json();
  assert.equal(vendas.length, 1);
  const busca = (await app.inject({ method: 'GET', url: '/api/crm/leads?q=Maria', headers: crm() })).json();
  assert.equal(busca.length, 1);
  const sum = (await app.inject({ method: 'GET', url: '/api/crm/summary', headers: crm() })).json();
  const meta = sum.find((r) => r.origin === 'meta');
  const google = sum.find((r) => r.origin === 'google');
  assert.equal(google.leads, 2);
  assert.equal(meta.vendas, 1);
  assert.equal(meta.receita, 12500.9);
});
