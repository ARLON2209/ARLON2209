import { readFileSync } from 'node:fs';
import { randomInt, timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';

const TRACKER_JS = readFileSync(new URL('../public/t.js', import.meta.url), 'utf8');

const EVENT_NAMES = new Set(['PageView', 'ViewContent', 'Contact', 'Lead', 'Schedule', 'Purchase']);
const ORIGIN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'gbraid', 'wbraid', 'fbclid'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

const str = (v, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const uuid = (v) => (typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : null);

function pickOrigin(src = {}) {
  const o = {};
  for (const k of ORIGIN_KEYS) o[k] = str(src[k], 300);
  o.fbc = str(src.fbc, 300);
  o.fbp = str(src.fbp, 300);
  return o;
}
const hasOrigin = (o) => ORIGIN_KEYS.some((k) => o[k]);

function newCode(len = 5) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export function buildApp({ pool, adminToken = process.env.ADMIN_TOKEN, logger = true } = {}) {
  const app = Fastify({ logger, trustProxy: true, bodyLimit: 16 * 1024 });

  // sendBeacon envia text/plain; aceitamos e tratamos como JSON.
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (req, body, done) => {
    try { done(null, JSON.parse(body)); } catch { done(Object.assign(new Error('JSON inválido'), { statusCode: 400 })); }
  });

  // /collect é chamado de sites de clientes; sem cookies, então CORS aberto é seguro aqui.
  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/collect')) {
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Headers', 'Content-Type');
    }
  });
  app.options('/collect', async (req, reply) => reply.code(204).send());

  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { ok: true };
  });

  app.get('/t.js', async (req, reply) => {
    reply.header('Content-Type', 'application/javascript; charset=utf-8');
    reply.header('Cache-Control', 'public, max-age=300');
    return TRACKER_JS;
  });

  // ---- Coleta de eventos do site ----
  app.post('/collect', async (req, reply) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const eventId = uuid(b.event_id);
    const vid = uuid(b.vid);
    const name = str(b.name, 40);
    const clientSlug = str(b.client, 63);
    if (!eventId || !vid || !name || !EVENT_NAMES.has(name) || !clientSlug) {
      return reply.code(400).send({ error: 'payload inválido' });
    }
    const { rows } = await pool.query('SELECT id FROM clients WHERE slug = $1', [clientSlug]);
    if (!rows.length) return reply.code(404).send({ error: 'cliente desconhecido' });
    const clientId = rows[0].id;

    const origin = pickOrigin({ ...(b.utm || {}), fbc: b.fbc, fbp: b.fbp });
    const url = str(b.url, 2000);
    const value = Number.isFinite(Number(b.value)) && b.value !== null && b.value !== '' ? Number(b.value) : null;

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query(
        `INSERT INTO visitors (vid, client_id, first_touch) VALUES ($1, $2, $3)
         ON CONFLICT (vid) DO UPDATE SET last_seen = now()`,
        [vid, clientId, hasOrigin(origin) ? origin : {}],
      );
      // Ponto de contato só quando a visita chega com origem nova (UTM ou ID de clique na URL).
      if (b.new_touch === true && hasOrigin(origin)) {
        await db.query(
          `INSERT INTO touchpoints (client_id, vid, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
             gclid, gbraid, wbraid, fbclid, fbc, fbp, referrer, landing_url, ip, user_agent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [clientId, vid, origin.utm_source, origin.utm_medium, origin.utm_campaign, origin.utm_term,
            origin.utm_content, origin.gclid, origin.gbraid, origin.wbraid, origin.fbclid, origin.fbc, origin.fbp,
            str(b.ref, 2000), url, req.ip, str(req.headers['user-agent'], 500)],
        );
      }
      await db.query(
        `INSERT INTO events (event_id, client_id, vid, name, url, value, currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (event_id) DO NOTHING`,
        [eventId, clientId, vid, name, url, value, str(b.currency, 3)],
      );
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    } finally {
      db.release();
    }
    return reply.code(204).send();
  });

  // ---- Link de rastreio do WhatsApp: grava o clique e redireciona com código ----
  app.get('/w/:slug', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT l.id, l.client_id, l.message, c.whatsapp_phone
         FROM tracking_links l JOIN clients c ON c.id = l.client_id
        WHERE l.slug = $1 AND l.active`,
      [String(req.params.slug).toLowerCase()],
    );
    if (!rows.length) return reply.code(404).type('text/plain; charset=utf-8').send('Link não encontrado.');
    const link = rows[0];
    const q = req.query || {};
    const origin = pickOrigin(q);

    let code;
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = newCode();
      const res = await pool.query(
        `INSERT INTO wa_clicks (code, client_id, link_id, vid, utm_source, utm_medium, utm_campaign, utm_term,
           utm_content, gclid, gbraid, wbraid, fbclid, fbc, fbp, landing_url, ip, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (code) DO NOTHING RETURNING code`,
        [candidate, link.client_id, link.id, uuid(q.vid), origin.utm_source, origin.utm_medium,
          origin.utm_campaign, origin.utm_term, origin.utm_content, origin.gclid, origin.gbraid, origin.wbraid,
          origin.fbclid, origin.fbc, origin.fbp, str(q.landing, 2000) || str(req.headers.referer, 2000),
          req.ip, str(req.headers['user-agent'], 500)],
      );
      if (res.rows.length) code = candidate;
    }
    if (!code) throw new Error('não foi possível gerar código único');

    const phone = String(link.whatsapp_phone).replace(/\D/g, '');
    const text = `${link.message}\n\n(cód. ${code})`;
    reply.header('Cache-Control', 'no-store');
    return reply.redirect(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, 302);
  });

  // ---- Administração (protegida por ADMIN_TOKEN) ----
  app.register(async (admin) => {
    admin.addHook('onRequest', async (req, reply) => {
      const sent = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      const expected = Buffer.from(String(adminToken || ''));
      if (!adminToken || sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
        return reply.code(401).send({ error: 'não autorizado' });
      }
    });

    admin.post('/clients', async (req, reply) => {
      const b = req.body || {};
      const slug = str(b.slug, 63)?.toLowerCase();
      const phone = String(b.whatsapp_phone || '').replace(/\D/g, '');
      if (!slug || !SLUG_RE.test(slug) || !str(b.name) || phone.length < 12) {
        return reply.code(400).send({ error: 'informe slug (a-z, 0-9, -), name e whatsapp_phone com DDI' });
      }
      const { rows } = await pool.query(
        `INSERT INTO clients (slug, name, whatsapp_phone, meta_pixel_id) VALUES ($1,$2,$3,$4)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, whatsapp_phone = EXCLUDED.whatsapp_phone,
           meta_pixel_id = EXCLUDED.meta_pixel_id
         RETURNING *`,
        [slug, str(b.name), phone, str(b.meta_pixel_id, 30)],
      );
      return reply.code(201).send(rows[0]);
    });

    admin.post('/links', async (req, reply) => {
      const b = req.body || {};
      const slug = str(b.slug, 63)?.toLowerCase();
      const channel = ['google', 'meta', 'organico', 'outro'].includes(b.channel) ? b.channel : 'outro';
      if (!slug || !SLUG_RE.test(slug) || !str(b.name) || !str(b.message, 1000) || !str(b.client)) {
        return reply.code(400).send({ error: 'informe client, slug, name e message' });
      }
      const c = await pool.query('SELECT id FROM clients WHERE slug = $1', [str(b.client)]);
      if (!c.rows.length) return reply.code(404).send({ error: 'cliente desconhecido' });
      const { rows } = await pool.query(
        `INSERT INTO tracking_links (client_id, slug, name, channel, message) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, channel = EXCLUDED.channel,
           message = EXCLUDED.message, active = true
         RETURNING *`,
        [c.rows[0].id, slug, str(b.name), channel, str(b.message, 1000)],
      );
      return reply.code(201).send(rows[0]);
    });

    // Últimos cliques para o WhatsApp de um cliente.
    admin.get('/clicks', async (req, reply) => {
      const client = str(req.query.client);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
      if (!client) return reply.code(400).send({ error: 'informe ?client=' });
      const { rows } = await pool.query(
        `SELECT w.code, w.ts, l.name AS link, l.channel, w.utm_source, w.utm_medium, w.utm_campaign,
                w.utm_term, w.utm_content, (w.gclid IS NOT NULL OR w.gbraid IS NOT NULL OR w.wbraid IS NOT NULL) AS tem_gclid,
                (w.fbclid IS NOT NULL OR w.fbc IS NOT NULL) AS tem_fbclid
           FROM wa_clicks w JOIN tracking_links l ON l.id = w.link_id JOIN clients c ON c.id = w.client_id
          WHERE c.slug = $1 ORDER BY w.ts DESC LIMIT $2`,
        [client, limit],
      );
      return rows;
    });

    // Consulta um código (o atendente vê "cód. K7P2M" na conversa e descobre a origem).
    admin.get('/clicks/:code', async (req, reply) => {
      const { rows } = await pool.query(
        `SELECT w.*, l.name AS link, l.channel, c.slug AS client
           FROM wa_clicks w JOIN tracking_links l ON l.id = w.link_id JOIN clients c ON c.id = w.client_id
          WHERE w.code = $1`,
        [String(req.params.code).toUpperCase()],
      );
      if (!rows.length) return reply.code(404).send({ error: 'código não encontrado' });
      return rows[0];
    });
  }, { prefix: '/admin' });

  return app;
}
