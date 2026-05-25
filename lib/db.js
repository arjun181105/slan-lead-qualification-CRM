import { neon } from '@neondatabase/serverless';

const CONN = process.env.Storage_POSTGRES_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!CONN) {
  console.warn('No Postgres connection string in env');
}

const rawSql = CONN ? neon(CONN) : null;

// Wrap neon's tagged-template to return { rows } shape that matches @vercel/postgres
// Also expose .query(text, values) for the dynamic update in /api/leads/[id]
function makeWrapped(raw) {
  if (!raw) return null;
  const wrapped = async (strings, ...values) => {
    const rows = await raw(strings, ...values);
    return { rows, rowCount: rows.length };
  };
  wrapped.query = async (text, values = []) => {
    const rows = await raw.query(text, values);
    return { rows, rowCount: rows.length };
  };
  return wrapped;
}

export const sql = makeWrapped(rawSql);

let initialized = false;

export async function ensureSchema() {
  if (initialized) return;
  if (!sql) throw new Error('Database not configured');
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      phone         TEXT NOT NULL,
      email         TEXT NOT NULL,
      loan_purpose  TEXT,
      timeline      TEXT,
      source        TEXT,
      status        TEXT DEFAULT 'new',
      attempt_count INT DEFAULT 0,
      next_retry_at TIMESTAMPTZ,
      last_call_id  TEXT,
      notes         TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS calls (
      id                    SERIAL PRIMARY KEY,
      lead_id               INT REFERENCES leads(id) ON DELETE CASCADE,
      call_id               TEXT UNIQUE,
      started_at            TIMESTAMPTZ DEFAULT NOW(),
      ended_at              TIMESTAMPTZ,
      duration_ms           INT,
      disconnection_reason  TEXT,
      call_outcome          TEXT,
      is_qualified          BOOLEAN,
      booked_callback       BOOLEAN,
      is_dnc                BOOLEAN,
      wrong_person          BOOLEAN,
      loan_amount_estimate  TEXT,
      loan_purpose_confirmed TEXT,
      preferred_callback_time TEXT,
      call_summary          TEXT,
      transcript            TEXT,
      recording_url         TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_leads_retry ON leads(next_retry_at) WHERE status = 'retry_pending'`;
  await sql`CREATE INDEX IF NOT EXISTS idx_calls_lead ON calls(lead_id)`;
  initialized = true;
}
