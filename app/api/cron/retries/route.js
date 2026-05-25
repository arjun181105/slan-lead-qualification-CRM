import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '../../../../lib/db';
import { makeRetellCall, isMelbourneBusinessHours } from '../../../../lib/integrations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  // Verify cron secret (Vercel adds this header on cron invocations)
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  await ensureSchema();

  if (!isMelbourneBusinessHours()) {
    return NextResponse.json({ ok: true, skipped: 'outside_business_hours' });
  }

  const { rows } = await sql`
    SELECT * FROM leads
    WHERE status = 'retry_pending'
      AND next_retry_at <= NOW()
      AND attempt_count < 3
    LIMIT 10
  `;

  const results = [];
  for (const lead of rows) {
    try {
      // Mark calling first so we don't double-fire
      await sql`UPDATE leads SET status = 'calling', attempt_count = attempt_count + 1, updated_at = NOW() WHERE id = ${lead.id}`;
      const call = await makeRetellCall({
        toNumber: lead.phone,
        leadName: lead.name,
        loanPurpose: lead.loan_purpose,
        timeline: lead.timeline,
        leadEmail: lead.email,
      });
      await sql`UPDATE leads SET last_call_id = ${call.call_id} WHERE id = ${lead.id}`;
      await sql`INSERT INTO calls (lead_id, call_id) VALUES (${lead.id}, ${call.call_id})`;
      results.push({ lead_id: lead.id, call_id: call.call_id, ok: true });
    } catch (err) {
      console.error('Retry call failed for', lead.id, err);
      await sql`UPDATE leads SET status = 'call_failed', notes = ${err.message} WHERE id = ${lead.id}`;
      results.push({ lead_id: lead.id, ok: false, error: err.message });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
