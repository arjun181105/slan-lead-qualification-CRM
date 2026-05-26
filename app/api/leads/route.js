import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '../../../lib/db';
import { makeRetellCall } from '../../../lib/integrations';
import { isAuthed } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// CORS — allow only the SLAN form domain(s). Set ALLOWED_ORIGINS env to a comma-separated list to extend.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://slan-form.vercel.app').split(',').map(s => s.trim()).filter(Boolean);

function cors(res, req) {
  const origin = req?.headers?.get?.('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.headers.set('Access-Control-Allow-Origin', allowed);
  res.headers.set('Vary', 'Origin');
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type,X-API-Key');
  return res;
}

export async function OPTIONS(req) {
  return cors(new NextResponse(null, { status: 204 }), req);
}

export async function POST(req) {
  await ensureSchema();
  let body;
  try { body = await req.json(); } catch { return cors(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), req); }

  const { name, phone, email, loan_purpose, timeline, source } = body || {};
  if (!name || !phone || !email) {
    return cors(NextResponse.json({ error: "name, phone, email required" }, { status: 400 }), req);
  }

  // Insert lead
  const insertRes = await sql`
    INSERT INTO leads (name, phone, email, loan_purpose, timeline, source, status, attempt_count)
    VALUES (${name}, ${phone}, ${email}, ${loan_purpose || null}, ${timeline || null}, ${source || 'form'}, 'calling', 1)
    RETURNING id
  `;
  const leadId = insertRes.rows[0].id;

  // Fire Retell call
  let callId = null;
  let callError = null;
  try {
    const call = await makeRetellCall({
      toNumber: phone,
      leadName: name,
      loanPurpose: loan_purpose,
      timeline,
      leadEmail: email,
    });
    callId = call.call_id;
    await sql`UPDATE leads SET last_call_id = ${callId}, updated_at = NOW() WHERE id = ${leadId}`;
    // Insert call stub
    await sql`INSERT INTO calls (lead_id, call_id) VALUES (${leadId}, ${callId})`;
  } catch (err) {
    callError = err.message;
    console.error('Retell call error:', err);
    await sql`UPDATE leads SET status = 'call_failed', notes = ${callError}, updated_at = NOW() WHERE id = ${leadId}`;
  }

  return cors(NextResponse.json({
    lead_id: leadId,
    call_id: callId,
    error: callError,
  }, { status: 201 }), req);
}

export async function GET(req) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await ensureSchema();
  const { rows } = await sql`
    SELECT l.*,
      (SELECT jsonb_build_object(
        'call_id', c.call_id,
        'duration_ms', c.duration_ms,
        'disconnection_reason', c.disconnection_reason,
        'call_outcome', c.call_outcome,
        'call_summary', c.call_summary,
        'is_qualified', c.is_qualified,
        'booked_callback', c.booked_callback,
        'loan_amount_estimate', c.loan_amount_estimate,
        'loan_purpose_confirmed', c.loan_purpose_confirmed,
        'preferred_callback_time', c.preferred_callback_time,
        'recording_url', c.recording_url,
        'transcript', c.transcript,
        'started_at', c.started_at
      ) FROM calls c WHERE c.lead_id = l.id ORDER BY c.started_at DESC LIMIT 1) AS latest_call
    FROM leads l
    ORDER BY l.created_at DESC
    LIMIT 200
  `;
  return NextResponse.json({ leads: rows });
}
