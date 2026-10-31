// Semana 2: mini-CRM de leads de WhatsApp.
// O atendente cola a 1ª mensagem (com "cód. K7P2M") ou informa a origem; depois move o lead pelas etapas.
import { createHash, randomBytes } from 'node:crypto';

export const STAGES = ['conversa', 'orcamento', 'venda', 'perdido'];
export const ORIGINS = ['google', 'meta', 'organico', 'indicacao', 'outro', 'desconhecida'];

const str = (v, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
export const hashKey = (k) => createHash('sha256').update(String(k)).digest('hex');
export const newCrmKey = () => randomBytes(24).toString('base64url');

// Telefone brasileiro: só dígitos, com DDI 55 quando vier sem.
export function normalizePhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 && d.length <= 15 ? d : null;
}

// Aceita o código sozinho ou a mensagem inteira ("... (cód. K7P2M)").
export function extractCode(v) {
  const s = String(v || '').trim().toUpperCase();
  const m = s.match(/C[ÓO]D\.?\s*:?\s*([A-Z0-9]{5})\b/) || s.match(/^([A-Z0-9]{5})$/);
  return m ? m[1] : null;
}

// Origem a partir do clique rastreado.
export function originFromClick(c) {
  const src = String(c.utm_source || '').toLowerCase();
  if (c.gclid || c.gbraid || c.wbraid || /google|adwords|gads/.test(src)) return 'google';
  if (c.fbclid || /meta|facebook|instagram|^fb$|^ig$/.test(src)) return 'meta';
  if (['google', 'meta', 'organico'].includes(c.channel)) return c.channel;
  return 'outro';
}

const LEAD_COLS = `l.id, l.phone, l.name, l.origin, l.origin_source, l.campaign, l.stage, l.value, l.notes,
  l.created_at, l.updated_at, w.code, w.utm_source, w.utm_medium, w.utm_term, w.utm_content, tl.name AS link`;
const LEAD_FROM = `leads l LEFT JOIN wa_clicks w ON w.id = l.click_id LEFT JOIN tracking_links tl ON tl.id = w.link_id`;

export async function crmRoutes(app, { pool }) {
  // Autenticação: cabeçalho x-crm-key -> cliente.
  app.addHook('onRequest', async (req, reply) => {
    const key = req.headers['x-crm-key'];
    if (!key || String(key).length < 20) return reply.code(401).send({ error: 'informe a chave de acesso' });
    const { rows } = await pool.query('SELECT id, slug, name FROM clients WHERE crm_key_hash = $1', [hashKey(key)]);
    if (!rows.length) return reply.code(401).send({ error: 'chave inválida' });
    req.client = rows[0];
  });

  app.get('/me', async (req) => ({ slug: req.client.slug, name: req.client.name, stages: STAGES, origins: ORIGINS }));

  async function findClick(clientId, code) {
    const { rows } = await pool.query(
      `SELECT w.*, l.name AS link, l.channel FROM wa_clicks w JOIN tracking_links l ON l.id = w.link_id
        WHERE w.code = $1 AND w.client_id = $2`,
      [code, clientId],
    );
    return rows[0] || null;
  }

  // Prévia da origem de um código (o atendente vê antes de salvar).
  app.get('/code/:code', async (req, reply) => {
    const code = extractCode(req.params.code);
    const click = code && (await findClick(req.client.id, code));
    if (!click) return reply.code(404).send({ error: 'código não encontrado' });
    return { code: click.code, ts: click.ts, origin: originFromClick(click), link: click.link,
      utm_campaign: click.utm_campaign, utm_term: click.utm_term, utm_content: click.utm_content };
  });

  async function getLead(clientId, id) {
    const { rows } = await pool.query(`SELECT ${LEAD_COLS} FROM ${LEAD_FROM} WHERE l.id = $1 AND l.client_id = $2`, [id, clientId]);
    return rows[0] || null;
  }

  // Cria (ou atualiza, se o telefone já existe) um lead.
  app.post('/leads', async (req, reply) => {
    const b = req.body || {};
    const phone = normalizePhone(b.phone);
    if (!phone) return reply.code(400).send({ error: 'telefone inválido (use DDD + número)' });
    const stage = STAGES.includes(b.stage) ? b.stage : 'conversa';

    let click = null;
    const code = extractCode(b.code);
    if (str(b.code) && !code) return reply.code(400).send({ error: 'código inválido' });
    if (code) {
      click = await findClick(req.client.id, code);
      if (!click) return reply.code(404).send({ error: 'código não encontrado para este cliente' });
    }
    const origin = click ? originFromClick(click) : (ORIGINS.includes(b.origin) ? b.origin : 'desconhecida');
    const campaign = click ? click.utm_campaign || click.link : str(b.campaign, 200);

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const { rows } = await db.query(
        `INSERT INTO leads (client_id, phone, name, click_id, origin, origin_source, campaign, stage, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (client_id, phone) DO UPDATE SET
           name = COALESCE(EXCLUDED.name, leads.name),
           -- um código novo sempre vence; sem código, só preenche se ainda não havia origem
           click_id = COALESCE(EXCLUDED.click_id, leads.click_id),
           origin = CASE WHEN EXCLUDED.click_id IS NOT NULL OR leads.origin = 'desconhecida' THEN EXCLUDED.origin ELSE leads.origin END,
           origin_source = CASE WHEN EXCLUDED.click_id IS NOT NULL THEN 'codigo' ELSE leads.origin_source END,
           campaign = CASE WHEN EXCLUDED.click_id IS NOT NULL THEN EXCLUDED.campaign ELSE COALESCE(leads.campaign, EXCLUDED.campaign) END,
           notes = COALESCE(EXCLUDED.notes, leads.notes),
           updated_at = now()
         RETURNING id, (xmax = 0) AS created`,
        [req.client.id, phone, str(b.name, 120), click?.id ?? null, origin, click ? 'codigo' : 'manual',
          campaign, stage, str(b.notes, 2000)],
      );
      const { id, created } = rows[0];
      if (created) await db.query('INSERT INTO lead_events (lead_id, stage) VALUES ($1,$2)', [id, stage]);
      await db.query('COMMIT');
      return reply.code(created ? 201 : 200).send({ ...(await getLead(req.client.id, id)), created });
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    } finally {
      db.release();
    }
  });

  app.get('/leads', async (req) => {
    const where = ['l.client_id = $1'];
    const params = [req.client.id];
    if (STAGES.includes(req.query.stage)) { params.push(req.query.stage); where.push(`l.stage = $${params.length}`); }
    const q = str(req.query.q, 60);
    if (q) {
      params.push(`%${q}%`, `%${q.replace(/\D/g, '') || '§'}%`);
      where.push(`(l.name ILIKE $${params.length - 1} OR l.phone LIKE $${params.length})`);
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
    const { rows } = await pool.query(
      `SELECT ${LEAD_COLS} FROM ${LEAD_FROM} WHERE ${where.join(' AND ')} ORDER BY l.updated_at DESC LIMIT ${limit}`,
      params,
    );
    return rows;
  });

  // Atualiza etapa, valor, nome, notas ou origem manual.
  app.patch('/leads/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    const cur = Number.isFinite(id) && (await getLead(req.client.id, id));
    if (!cur) return reply.code(404).send({ error: 'lead não encontrado' });
    const b = req.body || {};
    if (b.stage !== undefined && !STAGES.includes(b.stage)) return reply.code(400).send({ error: 'etapa inválida' });
    if (b.origin !== undefined && !ORIGINS.includes(b.origin)) return reply.code(400).send({ error: 'origem inválida' });
    if (b.origin !== undefined && cur.origin_source === 'codigo') {
      return reply.code(409).send({ error: 'a origem deste lead veio do código e não pode ser trocada' });
    }
    let value = null;
    if (b.value !== undefined && b.value !== null && b.value !== '') {
      value = Number(String(b.value).replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) return reply.code(400).send({ error: 'valor inválido' });
    }
    if (b.stage === 'venda' && value === null && cur.value === null) {
      return reply.code(400).send({ error: 'informe o valor da venda' });
    }

    const stageChanged = b.stage !== undefined && b.stage !== cur.stage;
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query(
        `UPDATE leads SET
           stage = COALESCE($3, stage), value = COALESCE($4, value), name = COALESCE($5, name),
           notes = COALESCE($6, notes), origin = COALESCE($7, origin), campaign = COALESCE($8, campaign),
           updated_at = now()
         WHERE id = $1 AND client_id = $2`,
        [id, req.client.id, b.stage ?? null, value, str(b.name, 120), str(b.notes, 2000),
          b.origin ?? null, cur.origin_source === 'codigo' ? null : str(b.campaign, 200)],
      );
      if (stageChanged) {
        await db.query('INSERT INTO lead_events (lead_id, stage, value) VALUES ($1,$2,$3)',
          [id, b.stage, b.stage === 'venda' ? (value ?? cur.value) : null]);
      }
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    } finally {
      db.release();
    }
    return getLead(req.client.id, id);
  });

  // Resumo por origem e etapa no período (padrão: últimos 30 dias, pela data de entrada do lead).
  app.get('/summary', async (req) => {
    const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : null;
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : null;
    const { rows } = await pool.query(
      `SELECT origin,
              count(*)::int AS leads,
              count(*) FILTER (WHERE stage IN ('orcamento','venda'))::int AS orcamentos,
              count(*) FILTER (WHERE stage = 'venda')::int AS vendas,
              COALESCE(sum(value) FILTER (WHERE stage = 'venda'), 0)::float AS receita
         FROM leads
        WHERE client_id = $1
          AND created_at >= (COALESCE($2::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29))::timestamp AT TIME ZONE 'America/Sao_Paulo'
          AND created_at <  (COALESCE($3::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date) + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
        GROUP BY origin ORDER BY leads DESC`,
      [req.client.id, from, to],
    );
    return rows;
  });
}
