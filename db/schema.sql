-- Aangan Call Qualifier — Neon Postgres schema (idempotent)

CREATE TABLE IF NOT EXISTS calls (
  id                 SERIAL PRIMARY KEY,
  external_id        TEXT UNIQUE NOT NULL,          -- Vaani call/session id (or seed id)
  source             TEXT NOT NULL DEFAULT 'vaani', -- vaani | seed | simulate
  caller_name        TEXT,
  caller_phone       TEXT,
  started_at         TIMESTAMPTZ NOT NULL,
  duration_sec       INTEGER,
  after_hours        BOOLEAN NOT NULL DEFAULT FALSE, -- outside 10am–7pm IST
  transcript         TEXT NOT NULL,

  status             TEXT NOT NULL CHECK (status IN ('good','unsure','bad','escalation')),
  intent             TEXT NOT NULL,
  project_type       TEXT NOT NULL DEFAULT 'unknown',
  scope_summary      TEXT NOT NULL DEFAULT '',
  location           TEXT,
  carpet_area_sqft   INTEGER,
  timeline           TEXT,
  budget_mentioned   TEXT,
  criteria           JSONB NOT NULL DEFAULT '{}',
  reasons            JSONB NOT NULL DEFAULT '[]',
  open_questions     JSONB NOT NULL DEFAULT '[]',
  pricing_asked      BOOLEAN NOT NULL DEFAULT FALSE,
  caller_frustrated  BOOLEAN NOT NULL DEFAULT FALSE,
  handoff_note       TEXT NOT NULL DEFAULT '',

  booked_at          TIMESTAMPTZ,                   -- consultation slot booked via Cal.com
  booking_id         TEXT,
  hubspot_contact_id TEXT,
  hubspot_deal_id    TEXT,
  email_sent_at      TIMESTAMPTZ,

  voice_cost_inr     NUMERIC(10,2) NOT NULL DEFAULT 0,
  voice_cost_actual  BOOLEAN NOT NULL DEFAULT FALSE, -- true once Vaani usage.charged arrives
  ai_cost_inr        NUMERIC(10,4) NOT NULL DEFAULT 0,
  email_cost_inr     NUMERIC(10,2) NOT NULL DEFAULT 0,
  ai_input_tokens    INTEGER NOT NULL DEFAULT 0,
  ai_output_tokens   INTEGER NOT NULL DEFAULT 0,
  ai_model           TEXT,
  errors             JSONB NOT NULL DEFAULT '[]',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calls_started_at_idx ON calls (started_at DESC);

-- Raw webhook events, for dedupe (Vaani retries) and audit
CREATE TABLE IF NOT EXISTS webhook_events (
  id          TEXT PRIMARY KEY,                     -- Vaani envelope id (evt_...)
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consultations booked during calls (Cal.com) before the call record exists
CREATE TABLE IF NOT EXISTS bookings (
  id           SERIAL PRIMARY KEY,
  booking_id   TEXT UNIQUE,
  caller_phone TEXT,
  caller_name  TEXT,
  slot_start   TIMESTAMPTZ NOT NULL,
  summary      TEXT,
  call_ref     TEXT,                                -- Vaani call id if the tool passed it
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- Calls placed from the dashboard ("Call a lead"), via Vaani trigger-call
CREATE TABLE IF NOT EXISTS outbound_calls (
  id            SERIAL PRIMARY KEY,
  phone         TEXT NOT NULL,
  name          TEXT,
  status        TEXT NOT NULL DEFAULT 'dialing',   -- dialing | failed | completed | no_answer
  vaani_call_id TEXT,
  error         TEXT,
  demo          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbound_calls_created_idx ON outbound_calls (created_at DESC);
