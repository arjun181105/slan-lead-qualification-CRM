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

  // Current Melbourne time, formatted for Alex e.g. "10:30 AM Tuesday"
  const melbourneTime = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    weekday: 'long',
  }).format(new Date());

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
        melbourne_time: melbourneTime,
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

// Returns the Melbourne timezone offset (+10:00 or +11:00) for a given UTC instant
// Uses Intl.DateTimeFormat to ask the OS, so DST is always correct regardless of date.
function melbourneOffsetAt(date) {
  // Format the same instant in both UTC and Melbourne, diff the wall-clock hours
  const opts = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  const melParts = new Intl.DateTimeFormat('en-CA', { ...opts, timeZone: 'Australia/Melbourne' }).formatToParts(date);
  const utcParts = new Intl.DateTimeFormat('en-CA', { ...opts, timeZone: 'UTC' }).formatToParts(date);
  const get = (parts, t) => parts.find(p => p.type === t).value;
  const melMs = Date.UTC(get(melParts, 'year'), get(melParts, 'month') - 1, get(melParts, 'day'), get(melParts, 'hour'), get(melParts, 'minute'), get(melParts, 'second'));
  const utcMs = Date.UTC(get(utcParts, 'year'), get(utcParts, 'month') - 1, get(utcParts, 'day'), get(utcParts, 'hour'), get(utcParts, 'minute'), get(utcParts, 'second'));
  const offsetMinutes = (melMs - utcMs) / 60000;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

// Returns the next valid 9am Melbourne instant strictly AFTER `date`.
// - If `date` is before 9am Melbourne today → today 9am Melbourne.
// - If `date` is at/after 9am Melbourne → tomorrow 9am Melbourne.
// DST-safe via melbourneOffsetAt().
function next9amMelbourne(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t) => fmt.find(p => p.type === t).value;
  const y = parseInt(get('year'), 10);
  const m = parseInt(get('month'), 10);
  const d = parseInt(get('day'), 10);
  const hour = parseInt(get('hour'), 10);

  // Build a candidate "today 9am Melbourne" instant
  // Use the offset for that day (DST may flip overnight, but close enough — we re-check below)
  const buildAt = (year, month, day) => {
    const ymd = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    // First pass with a guessed offset (use offset of original date)
    const guess = new Date(`${ymd}T09:00:00${melbourneOffsetAt(date)}`);
    // Re-derive offset at the guessed instant in case of DST crossover
    const realOffset = melbourneOffsetAt(guess);
    return new Date(`${ymd}T09:00:00${realOffset}`);
  };

  if (hour < 9) {
    // Before 9am today Melbourne → today 9am
    return buildAt(y, m, d);
  }
  // 9am or later → tomorrow 9am. Use a Date to handle month/year rollover.
  const tomorrow = new Date(Date.UTC(y, m - 1, d) + 24 * 60 * 60 * 1000);
  return buildAt(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate());
}
