import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sql, ensureSchema } from '../../../lib/db';
import { sendTelnyxSMS, nextRetryAt } from '../../../lib/integrations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Verify Retell webhook signature.
// Format: header is "v={timestamp_ms},d={hex_digest}"
// digest = HMAC-SHA256(api_key, rawBody + timestamp_ms)
// Docs: https://docs.retellai.com/features/secure-webhook
function verifyRetellSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  // Parse "v=...,d=..." into { v, d }
  const parts = Object.fromEntries(
    signatureHeader.split(',').map(p => {
      const i = p.indexOf('=');
      return i === -1 ? [p, ''] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const timestamp = parts.v;
  const provided = parts.d;
  if (!timestamp || !provided) return false;

  // Reject signatures older than 5 minutes (replay protection)
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody + timestamp).digest('hex');
  if (expected.length !== provided.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  } catch {
    return false;
  }
}

export async function POST(req) {
  await ensureSchema();
  const rawBody = await req.text();

  // Signature verification (skippable in dev via WEBHOOK_VERIFY=0 if needed)
  const verifyEnabled = process.env.WEBHOOK_VERIFY !== '0';
  if (verifyEnabled) {
    const sig = req.headers.get('x-retell-signature');
    if (!verifyRetellSignature(rawBody, sig, process.env.RETELL_API_KEY)) {
      console.warn('Rejected webhook with bad/missing signature');
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch { payload = {}; }

  // Retell sends events: call_started, call_ended, call_analyzed
  const event = payload.event || payload.type;
  const call = payload.call || payload;
  const callId = call.call_id;
  if (!callId) {
    return NextResponse.json({ ok: false, reason: 'no_call_id' }, { status: 200 });
  }

  // Find the lead
  const { rows: callRows } = await sql`SELECT lead_id FROM calls WHERE call_id = ${callId} LIMIT 1`;
  if (callRows.length === 0) {
    console.warn('No matching call for', callId);
    return NextResponse.json({ ok: true, ignored: true });
  }
  const leadId = callRows[0].lead_id;

  // For call_started / call_ended just touch lead status; act on call_analyzed
  if (event !== 'call_analyzed') {
    await sql`UPDATE calls SET disconnection_reason = ${call.disconnection_reason || null}, ended_at = NOW(), duration_ms = ${call.duration_ms || null} WHERE call_id = ${callId}`;
    return NextResponse.json({ ok: true, event });
  }

  // Extract analysis
  const analysis = call.call_analysis || {};
  const custom = analysis.custom_analysis_data || {};
  const reason = call.disconnection_reason || 'unknown';
  const transcript = call.transcript || null;
  const recording = call.recording_url || null;

  // Update call row
  await sql`
    UPDATE calls SET
      duration_ms = ${call.duration_ms || null},
      disconnection_reason = ${reason},
      call_outcome = ${custom.call_outcome || null},
      is_qualified = ${custom.is_qualified ?? null},
      booked_callback = ${custom.booked_callback ?? null},
      is_dnc = ${custom.is_dnc ?? null},
      wrong_person = ${custom.wrong_person ?? null},
      loan_amount_estimate = ${custom.loan_amount_estimate || null},
      loan_purpose_confirmed = ${custom.loan_purpose_confirmed || null},
      preferred_callback_time = ${custom.preferred_callback_time || null},
      call_summary = ${custom.call_summary || analysis.call_summary || null},
      transcript = ${transcript},
      recording_url = ${recording},
      ended_at = COALESCE(ended_at, NOW())
    WHERE call_id = ${callId}
  `;

  // Get lead details for SMS/routing
  const { rows: leadRows } = await sql`SELECT * FROM leads WHERE id = ${leadId} LIMIT 1`;
  if (leadRows.length === 0) return NextResponse.json({ ok: true });
  const lead = leadRows[0];

  // ROUTING
  const userPickedUp = !['dial_no_answer', 'dial_busy', 'dial_failed', 'voicemail_reached', 'telephony_provider_permission_denied', 'invalid_destination', 'error_no_phone_number'].includes(reason);
  const outcome = custom.call_outcome;

  let newStatus = lead.status;
  let newRetry = null;
  let ivanSms = null;
  let leadSms = null;

  if (custom.wrong_person === true) {
    newStatus = 'wrong_number';
  } else if (custom.is_dnc === true || outcome === 'not_interested') {
    newStatus = 'not_interested';
  } else if (outcome === 'booked' || (custom.booked_callback === true && outcome !== 'send_link')) {
    newStatus = 'hot';
    ivanSms = `🔥 SLAN: ${lead.name} BOOKED a callback. ${custom.loan_purpose_confirmed || lead.loan_purpose || 'finance'}. Amount: ${custom.loan_amount_estimate || 'TBC'}. ${custom.preferred_callback_time ? 'Time: ' + custom.preferred_callback_time + '. ' : ''}Phone: ${lead.phone}. Summary: ${custom.call_summary || 'See CRM.'}`;
  } else if (outcome === 'send_link') {
    newStatus = 'send_link';
    leadSms = `Hi ${lead.name.split(' ')[0]}, it's Alex from SLAN Finance — great chatting just now. Here's where you can grab a time with one of our brokers: https://slanfinance.com.au/contact-slan-finance-caroline-springs/ — or just reply with a time that suits and we'll lock it in. Cheers.`;
    ivanSms = `📤 SLAN: ${lead.name} asked for booking link. ${custom.loan_purpose_confirmed || lead.loan_purpose}. Amount: ${custom.loan_amount_estimate || 'TBC'}. Phone: ${lead.phone}.`;
  } else if (outcome === 'callback_later' || (reason === 'user_hangup' && lead.attempt_count < 3)) {
    newRetry = nextRetryAt(lead.attempt_count);
    if (newRetry) {
      newStatus = 'retry_pending';
      leadSms = `Hi ${lead.name.split(' ')[0]}, Alex from SLAN Finance — sorry to miss you. We had your ${lead.loan_purpose ? lead.loan_purpose.replace(/_/g, ' ') : 'finance'} enquiry come through. I'll try you again ${newRetry < new Date(Date.now() + 6 * 3600_000) ? 'in a few hours' : 'tomorrow'}, or grab a time here: https://slanfinance.com.au/contact-slan-finance-caroline-springs/`;
    } else {
      newStatus = 'dead';
    }
  } else if (outcome === 'voicemail' || reason === 'voicemail_reached') {
    // Hit voicemail (real answering machine) or screener — same handling: retry, send SMS
    if (lead.attempt_count < 3) {
      newRetry = nextRetryAt(lead.attempt_count);
      if (newRetry) {
        newStatus = 'retry_pending';
        leadSms = `Hi ${lead.name.split(' ')[0]}, Alex from SLAN Finance — tried calling about your ${lead.loan_purpose ? lead.loan_purpose.replace(/_/g, ' ') : 'finance'} enquiry but couldn't get through. Reply here with a good time, or book direct: https://slanfinance.com.au/contact-slan-finance-caroline-springs/`;
      } else {
        newStatus = 'dead';
      }
    } else {
      newStatus = 'dead';
    }
  } else if (!userPickedUp) {
    // No answer / busy / failed (voicemail handled above)
    if (reason === 'dial_failed' || reason === 'telephony_provider_permission_denied' || reason === 'invalid_destination') {
      newStatus = 'bad_number';
    } else if (lead.attempt_count < 3) {
      newRetry = nextRetryAt(lead.attempt_count);
      if (newRetry) {
        newStatus = 'retry_pending';
        leadSms = `Hi ${lead.name.split(' ')[0]}, Alex from SLAN Finance — just tried calling about your ${lead.loan_purpose ? lead.loan_purpose.replace(/_/g, ' ') : 'finance'} enquiry. Reply with a good time to call or book here: https://slanfinance.com.au/contact-slan-finance-caroline-springs/`;
      } else {
        newStatus = 'dead';
      }
    } else {
      newStatus = 'dead';
    }
  } else {
    // Picked up but no clear outcome
    newStatus = lead.attempt_count < 3 ? 'retry_pending' : 'no_answer';
    if (newStatus === 'retry_pending') newRetry = nextRetryAt(lead.attempt_count);
  }

  await sql`
    UPDATE leads SET
      status = ${newStatus},
      next_retry_at = ${newRetry ? newRetry.toISOString() : null},
      updated_at = NOW()
    WHERE id = ${leadId}
  `;

  // Fire SMS (don't block on errors)
  const smsResults = {};
  if (ivanSms && process.env.IVAN_PHONE) {
    smsResults.ivan = await sendTelnyxSMS({ to: process.env.IVAN_PHONE, text: ivanSms });
  }
  if (leadSms) {
    smsResults.lead = await sendTelnyxSMS({ to: lead.phone, text: leadSms });
  }

  return NextResponse.json({ ok: true, new_status: newStatus, sms: smsResults });
}
