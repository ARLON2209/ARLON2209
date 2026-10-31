// Testes de integração. Precisam de um Postgres: DATABASE_URL=postgres://... npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { createPool, migrate } from '../src/db.js';

const TOKEN = 'token-de-teste-123';
const auth = { authorization: `Bearer ${TOKEN}` };
let pool, app;

before(async () => {
  pool = createPool(process.env.DATABASE_URL);
  await pool.query('DROP TABLE IF EXISTS wa_clicks, events, touchpoints, visitors, tracking_links, clients CASCADE');
  await migrate(pool);
  await migrate(pool); // idempotente
  app = buildApp({ pool, adminToken: TOKEN, logger: false });
  await app.ready();
});
after(async () => { await app.close(); await pool.end(); });

test('admin exige token', async () => {
  const r = await app.inject({ method: 'POST', url: '/admin/clients', payload: {} });
  assert.equal(r.statusCode, 401);
  const r2 = await app.inject({ method: 'POST', url: '/admin/clients', payload: {}, headers: { authorization: 'Bearer errado' } });
  assert.equal(r2.statusCode, 401);
});

test('cadastra cliente e link', async () => {
  const c = await app.inject({ method: 'POST', url: '/admin/clients', headers: auth,
    payload: { slug: 'butzke', name: 'Butzke Esquadrias', whatsapp_phone: '+55 (47) 99999-0000' } });
  assert.equal(c.statusCode, 201);
  assert.equal(c.json().whatsapp_phone, '5547999990000');
  const l = await app.inject({ method: 'POST', url: '/admin/links', headers: auth,
    payload: { client: 'butzke', slug: 'butzke-google', name: 'Google – Pesquisa', channel: 'google',
      message: 'Olá! Vi o anúncio no Google e quero um orçamento.' } });
  assert.equal(l.statusCode, 201);
});

test('/w/:slug grava o clique e redireciona para o WhatsApp com código', async () => {
  const vid = randomUUID();
  const r = await app.inject({ method: 'GET',
    url: `/w/butzke-google?vid=${vid}&gclid=GCLID123&utm_source=google&utm_campaign=pesquisa-vale-itajai&utm_term=janela+pvc` });
  assert.equal(r.statusCode, 302);
  const loc = new URL(r.headers.location);
  assert.equal(loc.host, 'wa.me');
  assert.equal(loc.pathname, '/5547999990000');
  const m = loc.searchParams.get('text').match(/\(cód\. ([A-Z0-9]{5})\)$/);
  assert.ok(m, 'mensagem deve terminar com o código');

  const info = await app.inject({ method: 'GET', url: `/admin/clicks/${m[1].toLowerCase()}`, headers: auth });
  assert.equal(info.statusCode, 200);
  const click = info.json();
  assert.equal(click.gclid, 'GCLID123');
  assert.equal(click.utm_campaign, 'pesquisa-vale-itajai');
  assert.equal(click.utm_term, 'janela pvc');
  assert.equal(click.vid, vid);
  assert.equal(click.channel, 'google');

  const list = await app.inject({ method: 'GET', url: '/admin/clicks?client=butzke', headers: auth });
  assert.equal(list.json()[0].tem_gclid, true);
});

test('/w/:slug inexistente dá 404', async () => {
  const r = await app.inject({ method: 'GET', url: '/w/nao-existe' });
  assert.equal(r.statusCode, 404);
});

test('/collect aceita text/plain (sendBeacon), grava visitante, ponto de contato e evento', async () => {
  const vid = randomUUID();
  const event_id = randomUUID();
  const body = { client: 'butzke', event_id, vid, name: 'PageView', url: 'https://butzke.com.br/?gclid=X',
    utm: { gclid: 'X', utm_source: 'google' }, new_touch: true };
  const r = await app.inject({ method: 'POST', url: '/collect', headers: { 'content-type': 'text/plain' },
    payload: JSON.stringify(body) });
  assert.equal(r.statusCode, 204);
  assert.equal(r.headers['access-control-allow-origin'], '*');

  // repetir o mesmo event_id não duplica
  await app.inject({ method: 'POST', url: '/collect', headers: { 'content-type': 'text/plain' }, payload: JSON.stringify(body) });
  const ev = await pool.query('SELECT count(*)::int n FROM events WHERE event_id = $1', [event_id]);
  assert.equal(ev.rows[0].n, 1);
  const tp = await pool.query('SELECT gclid, utm_source FROM touchpoints WHERE vid = $1', [vid]);
  assert.equal(tp.rows[0].gclid, 'X');
  const v = await pool.query('SELECT first_touch FROM visitors WHERE vid = $1', [vid]);
  assert.equal(v.rows[0].first_touch.utm_source, 'google');
});

test('/collect rejeita payload inválido e cliente desconhecido', async () => {
  const bad = await app.inject({ method: 'POST', url: '/collect', payload: { client: 'butzke', name: 'Hack' } });
  assert.equal(bad.statusCode, 400);
  const unk = await app.inject({ method: 'POST', url: '/collect',
    payload: { client: 'outro', event_id: randomUUID(), vid: randomUUID(), name: 'PageView' } });
  assert.equal(unk.statusCode, 404);
  const notJson = await app.inject({ method: 'POST', url: '/collect', headers: { 'content-type': 'text/plain' }, payload: '{x' });
  assert.equal(notJson.statusCode, 400);
});

test('/t.js é servido', async () => {
  const r = await app.inject({ method: 'GET', url: '/t.js' });
  assert.equal(r.statusCode, 200);
  assert.match(r.headers['content-type'], /javascript/);
});
