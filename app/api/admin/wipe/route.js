import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '../../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One-shot wipe endpoint. Bearer-protected with CRON_SECRET.
// Will be removed in the immediate follow-up commit.
export async function POST(req) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await ensureSchema();
  // Cascade via FK from calls → leads, but TRUNCATE both explicitly to be safe.
  await sql`TRUNCATE TABLE calls, leads RESTART IDENTITY CASCADE`;
  return NextResponse.json({ ok: true, wiped: true });
}
