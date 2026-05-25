// Fire an outbound Retell call
export async function makeRetellCall({ toNumber, leadName, loanPurpose, timeline, leadEmail }) {
  const purposeNatural = {
    first_home: 'buying your first home',
    next_home: 'your next home purchase',
    refinance: 'looking at a refinance',
    investment: 'an investment property',
    business: 'business or commercial finance',
    other: 'your finance enquiry',
  }[loanPurpose] || 'your finance enquiry';

  const res = await fetch('https://api.retellai.com/v2/create-phone-call', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from_number: process.env.RETELL_FROM_NUMBER,
      to_number: toNumber,
      override_agent_id: process.env.RETELL_AGENT_ID,
      retell_llm_dynamic_variables: {
        lead_name: leadName || 'there',
        loan_purpose: loanPurpose || 'other',
        loan_purpose_natural: purposeNatural,
        timeline: timeline || 'just_looking',
        lead_email: leadEmail || '',
      },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Retell call failed ${res.status}: ${txt}`);
  }
  return res.json();
}

// Send SMS via Telnyx
export async function sendTelnyxSMS({ to, text }) {
  const res = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.TELNYX_FROM_NUMBER,
      to,
      text,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`Telnyx SMS failed ${res.status}: ${txt}`);
    return { ok: false, error: txt };
  }
  return { ok: true, data: await res.json() };
}

export function isMelbourneBusinessHours(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: 'numeric',
    hour12: false,
  });
  const hour = parseInt(fmt.format(date), 10);
  return hour >= 9 && hour < 19;
}

// Compute next retry timestamp based on attempt count
// Attempt 1 happened immediately. Now we schedule attempt 2,3,4.
export function nextRetryAt(attemptCount) {
  const now = new Date();
  let delayMs;
  if (attemptCount === 1) delayMs = 4 * 60 * 60 * 1000;       // +4h after first
  else if (attemptCount === 2) delayMs = 20 * 60 * 60 * 1000; // +20h after second (≈24h from first)
  else return null; // No more retries after attempt 3
  let target = new Date(now.getTime() + delayMs);
  // If outside business hours, bump to next 9am Melbourne
  if (!isMelbourneBusinessHours(target)) {
    target = next9amMelbourne(target);
  }
  return target;
}

function next9amMelbourne(date) {
  // Get the date in Melbourne, set to 9am, convert back to UTC-friendly Date
  const mel = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t) => mel.find(p => p.type === t).value;
  let y = get('year'), m = get('month'), d = get('day');
  const hour = parseInt(get('hour'), 10);
  // If currently before 9am same Melbourne day, target today 9am; else tomorrow 9am
  if (hour >= 19 || hour < 9) {
    // If past 7pm, push to next day. If before 9am, today is fine.
    if (hour >= 19) {
      // Add one day
      const next = new Date(`${y}-${m}-${d}T09:00:00+11:00`); // AEDT; close enough for demo
      next.setDate(next.getDate() + 1);
      return next;
    }
  }
  return new Date(`${y}-${m}-${d}T09:00:00+11:00`);
}
