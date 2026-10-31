-- Esquema do rastreamento próprio. Idempotente: pode rodar várias vezes.

-- Um cliente da agência (ex.: Butzke). Tudo é separado por cliente.
CREATE TABLE IF NOT EXISTS clients (
  id              SERIAL PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,          -- ex.: "butzke" (usado no script e nos links)
  name            TEXT NOT NULL,
  whatsapp_phone  TEXT NOT NULL,                 -- só dígitos, com DDI: 5547999999999
  meta_pixel_id   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Links de rastreio de WhatsApp: um por origem/campanha (ex.: "google-pesquisa").
CREATE TABLE IF NOT EXISTS tracking_links (
  id          SERIAL PRIMARY KEY,
  client_id   INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL UNIQUE,              -- ex.: "butzke-google" -> /w/butzke-google
  name        TEXT NOT NULL,                     -- ex.: "Google – Pesquisa – Vale do Itajaí"
  channel     TEXT NOT NULL DEFAULT 'outro',     -- google | meta | organico | outro
  message     TEXT NOT NULL,                     -- mensagem pré-preenchida no WhatsApp
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Visitante (cookie _vid). Guarda a primeira origem.
CREATE TABLE IF NOT EXISTS visitors (
  vid          UUID PRIMARY KEY,
  client_id    INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_touch  JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Cada chegada com origem (UTM ou ID de clique) vira um ponto de contato.
CREATE TABLE IF NOT EXISTS touchpoints (
  id            BIGSERIAL PRIMARY KEY,
  client_id     INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  vid           UUID REFERENCES visitors(vid) ON DELETE CASCADE,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  utm_source    TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT,
  gclid         TEXT, gbraid TEXT, wbraid TEXT, fbclid TEXT, fbc TEXT, fbp TEXT,
  referrer      TEXT,
  landing_url   TEXT,
  ip            INET,
  user_agent    TEXT
);
CREATE INDEX IF NOT EXISTS touchpoints_client_ts ON touchpoints (client_id, ts DESC);
CREATE INDEX IF NOT EXISTS touchpoints_vid ON touchpoints (vid);

-- Eventos do site (PageView, Contact...). event_id é o mesmo usado no Pixel (deduplicação).
CREATE TABLE IF NOT EXISTS events (
  event_id   UUID PRIMARY KEY,
  client_id  INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  vid        UUID REFERENCES visitors(vid) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  url        TEXT,
  value      NUMERIC(12,2),
  currency   TEXT,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_client_ts ON events (client_id, ts DESC);

-- Cada clique para o WhatsApp recebe um código curto que vai na mensagem.
-- É por esse código que, na Semana 2, a conversa é ligada ao clique (e ao anúncio).
CREATE TABLE IF NOT EXISTS wa_clicks (
  id            BIGSERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  client_id     INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  link_id       INT NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,
  vid           UUID,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  utm_source    TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT,
  gclid         TEXT, gbraid TEXT, wbraid TEXT, fbclid TEXT, fbc TEXT, fbp TEXT,
  landing_url   TEXT,
  ip            INET,
  user_agent    TEXT
);
CREATE INDEX IF NOT EXISTS wa_clicks_client_ts ON wa_clicks (client_id, ts DESC);

-- ===================== Semana 2: mini-CRM =====================

-- Chave de acesso do CRM por cliente (guardamos só o hash SHA-256).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS crm_key_hash TEXT UNIQUE;

-- Um lead por telefone por cliente. A origem vem do código (clique rastreado) ou é informada pelo atendente.
CREATE TABLE IF NOT EXISTS leads (
  id             BIGSERIAL PRIMARY KEY,
  client_id      INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  phone          TEXT NOT NULL,                 -- só dígitos, com DDI
  name           TEXT,
  click_id       BIGINT REFERENCES wa_clicks(id) ON DELETE SET NULL,
  origin         TEXT NOT NULL DEFAULT 'desconhecida', -- google | meta | organico | indicacao | outro | desconhecida
  origin_source  TEXT NOT NULL DEFAULT 'manual',       -- codigo | manual
  campaign       TEXT,                          -- utm_campaign do clique ou texto do atendente
  stage          TEXT NOT NULL DEFAULT 'conversa',     -- conversa | orcamento | venda | perdido
  value          NUMERIC(12,2),                 -- valor da venda
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, phone)
);
CREATE INDEX IF NOT EXISTS leads_client_created ON leads (client_id, created_at DESC);

-- Histórico de etapas: base para enviar Lead/Venda ao Meta e ao Google (Semana 3).
CREATE TABLE IF NOT EXISTS lead_events (
  id         BIGSERIAL PRIMARY KEY,
  lead_id    BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  stage      TEXT NOT NULL,
  value      NUMERIC(12,2),
  ts         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_events_lead ON lead_events (lead_id, ts);
