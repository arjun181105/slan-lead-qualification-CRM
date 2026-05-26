import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '../../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One-shot seed endpoint for demo data. Bearer-protected with CRON_SECRET.
// Will be removed in the immediate follow-up commit.
export async function POST(req) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await ensureSchema();

  // Realistic Melbourne demo leads — neutral, plausible names + numbers.
  const fakes = [
    {
      name: 'Sophie Mitchell',
      phone: '+61423998104',
      email: 'sophie.mitchell.21@gmail.com',
      loan_purpose: 'first_home',
      timeline: '1-3mo',
      hours_ago: 0.5,
      call_outcome: 'booked',
      duration_ms: 142000,
      is_qualified: true,
      loan_amount_estimate: '550,000',
      loan_purpose_confirmed: 'buying her first home in Reservoir or Coburg',
      preferred_callback_time: 'tomorrow at 11 AM',
      call_summary: "Sophie is a first-home buyer looking in Reservoir and Coburg areas with a budget around 550k. She's pre-approved with NAB but wants to compare options. PAYG income, 12% deposit saved. Looking to buy in the next 6-8 weeks. Booked for a callback tomorrow at 11 AM.",
      transcript: 'Agent: Hi, is this Sophie? It\'s Alex calling from SLAN Finance — you just popped a quick enquiry through our site about buying your first home. Have I caught you at an okay time?\nUser: Yeah, hi Alex. Yeah, all good.\nAgent: Beauty. So just so I can pair you with the right broker — tell me a bit about your situation?\nUser: Yeah, so I\'ve been looking at Reservoir and Coburg, mainly. Around the five-fifty mark.\nAgent: Got it. Five-fifty thousand?\nUser: Yeah, around there.\nAgent: Cool. And have you got a pre-approval already?\nUser: Yeah, with NAB, but I want to see what else is out there.\nAgent: Smart move. How soon are you hoping to be in?\nUser: Maybe six to eight weeks.\nAgent: Perfect. Want to lock in a time with one of our brokers tomorrow? They\'ll go through your situation properly and compare across our lenders.\nUser: Yeah, 11 AM works.\nAgent: Brilliant — you\'re locked in for 11 AM tomorrow. One of our team members will give you a buzz then. Anything else I can help with before I let you go?\nUser: Nope, that\'s all.\nAgent: Sweet — talk soon Sophie.',
      status: 'hot',
    },
    {
      name: 'Daniel Tran',
      phone: '+61498712334',
      email: 'd.tran.84@outlook.com',
      loan_purpose: 'refinance',
      timeline: 'now',
      hours_ago: 1.2,
      call_outcome: 'booked',
      duration_ms: 168000,
      is_qualified: true,
      loan_amount_estimate: '720,000',
      loan_purpose_confirmed: 'refinancing his Brunswick PPOR to lower the rate',
      preferred_callback_time: 'today at 4 PM',
      call_summary: "Daniel owns a property in Brunswick with around 720k remaining on the mortgage at Westpac. He's looking to refinance — primarily for a lower rate but interested in exploring equity release for renovations. Settled in his role at a tech firm for 4 years. Wants action this week.",
      transcript: 'Agent: Hi, is this Daniel? It\'s Alex from SLAN Finance — you just popped through about looking at a refinance. Have I caught you at an okay time?\nUser: Yep, go ahead.\nAgent: Cool. So is this your home or an investment?\nUser: Home, yeah. Brunswick.\nAgent: Got it. Rough amount on the current loan?\nUser: About seven-twenty.\nAgent: Seven-twenty thousand?\nUser: Yeah.\nAgent: Right. And what\'s the main goal — lower the rate, consolidate, pull equity?\nUser: Mainly the rate, but I\'d be interested in equity for some reno work.\nAgent: Cool. Want me to get a broker to give you a buzz this arvo? They can run the numbers properly.\nUser: Yeah, 4 PM works.\nAgent: Locked in for 4 PM today. One of our team members will give you a buzz then. Anything else?\nUser: Nah, all good.\nAgent: Talk soon Daniel.',
      status: 'hot',
    },
    {
      name: 'Priya Shah',
      phone: '+61432776891',
      email: 'priya.shah90@gmail.com',
      loan_purpose: 'investment',
      timeline: '3-6mo',
      hours_ago: 2.4,
      call_outcome: 'send_link',
      duration_ms: 95000,
      is_qualified: true,
      loan_amount_estimate: 'around 600k',
      loan_purpose_confirmed: 'investment property purchase, possibly Geelong or Werribee',
      preferred_callback_time: '',
      call_summary: "Priya is exploring her first investment property, looking at outer west suburbs (Geelong, Werribee) with a target purchase price around 600k. Self-employed (graphic design), wants to chat about how that affects borrowing capacity. Asked for the booking link to find a time that suits.",
      transcript: 'Agent: Hi, is this Priya? It\'s Alex from SLAN Finance — you popped through about an investment property. Got a sec?\nUser: Yes, but I only have a few minutes.\nAgent: All good, I\'ll keep it tight. Are you already looking at a specific area?\nUser: Maybe Geelong or Werribee, somewhere outer west.\nAgent: Got it. Rough budget?\nUser: Around six hundred.\nAgent: Six hundred grand?\nUser: Yeah.\nAgent: Cool. Want me to shoot you a link via text so you can pick a time that suits to chat properly with one of our brokers?\nUser: Yeah, that\'d be easier.\nAgent: Done — you\'ll get a text in a minute with the booking link. Cheers Priya.',
      status: 'send_link',
    },
    {
      name: 'Marcus Williams',
      phone: '+61404661227',
      email: 'marcus.w@bigpond.com',
      loan_purpose: 'next_home',
      timeline: 'now',
      hours_ago: 3.8,
      call_outcome: 'booked',
      duration_ms: 187000,
      is_qualified: true,
      loan_amount_estimate: '1.1 million',
      loan_purpose_confirmed: 'upgrading from current 3-bed to a 4-bed in Bentleigh or McKinnon',
      preferred_callback_time: 'tomorrow at 2 PM',
      call_summary: "Marcus is upgrading from his current home in Glen Iris to a larger 4-bedroom in the Bentleigh/McKinnon area for the school zones. Looking at around 1.1M total borrow, has approximately 350k equity in the current place. Wants to settle on the new one before listing the current one. Both partners PAYG.",
      transcript: 'Agent: Hi, is this Marcus? It\'s Alex from SLAN Finance — you popped through about your next home purchase. Have I caught you alright?\nUser: Yeah mate, fire away.\nAgent: Beauty. Already looking at a place, or just starting?\nUser: We\'re actively looking — Bentleigh, McKinnon, that area. School zones.\nAgent: Right. Rough loan amount?\nUser: Looking at borrowing maybe one-point-one mil total.\nAgent: One-point-one million?\nUser: Yeah.\nAgent: Cool. And how soon are you wanting to act?\nUser: ASAP — want to buy first then sell the current one.\nAgent: Smart. Want to lock in a proper sit-down with one of our brokers? They\'ll walk you through bridging finance options and lender comparisons.\nUser: Yeah, tomorrow afternoon? Around 2 PM?\nAgent: Sweet — 2 PM tomorrow. One of our team members will give you a buzz then. Anything else?\nUser: Nope all good cheers.\nAgent: Talk soon Marcus.',
      status: 'hot',
    },
    {
      name: 'Emma Nguyen',
      phone: '+61413558072',
      email: 'em.nguyen@protonmail.com',
      loan_purpose: 'first_home',
      timeline: '1-3mo',
      hours_ago: 4.5,
      call_outcome: 'callback_later',
      duration_ms: 28000,
      is_qualified: null,
      loan_amount_estimate: '',
      loan_purpose_confirmed: '',
      preferred_callback_time: 'tomorrow morning',
      call_summary: "Emma picked up but said she was on the train and couldn't talk properly. Agreed to a callback tomorrow morning. No qualifying detail captured yet.",
      transcript: 'Agent: Hi, is this Emma? It\'s Alex from SLAN Finance — you popped through about buying your first home. Got a sec?\nUser: Sorry I\'m on the train, can you call me back tomorrow?\nAgent: All good — what time suits tomorrow morning?\nUser: Maybe 10 AM?\nAgent: Sweet, we\'ll give you a buzz at 10 tomorrow. Cheers Emma.',
      status: 'retry_pending',
      next_retry_hours: 16,
      attempt_count: 1,
    },
    {
      name: 'Liam O\'Brien',
      phone: '+61429884116',
      email: 'liam.obrien.au@gmail.com',
      loan_purpose: 'refinance',
      timeline: 'just_looking',
      hours_ago: 5.1,
      call_outcome: 'callback_later',
      duration_ms: 0,
      is_qualified: null,
      loan_amount_estimate: '',
      loan_purpose_confirmed: '',
      preferred_callback_time: '',
      call_summary: '',
      transcript: '',
      status: 'retry_pending',
      next_retry_hours: 2,
      attempt_count: 1,
      no_call: true,  // no answer, no transcript
    },
  ];

  const results = [];
  for (const f of fakes) {
    const createdAt = new Date(Date.now() - f.hours_ago * 3600_000);
    const nextRetry = f.next_retry_hours
      ? new Date(Date.now() + f.next_retry_hours * 3600_000)
      : null;

    // Insert lead
    const { rows: [lead] } = await sql`
      INSERT INTO leads (name, phone, email, loan_purpose, timeline, source, status, attempt_count, next_retry_at, created_at, updated_at)
      VALUES (${f.name}, ${f.phone}, ${f.email}, ${f.loan_purpose}, ${f.timeline}, 'slan_demo_form', ${f.status}, ${f.attempt_count || 1}, ${nextRetry}, ${createdAt.toISOString()}, ${createdAt.toISOString()})
      RETURNING id
    `;

    let callId = null;
    if (!f.no_call) {
      // Generate a plausible call_id
      callId = 'call_demo_' + Math.random().toString(36).slice(2, 18);
      const callStartedAt = new Date(createdAt.getTime() + 5000); // 5s after lead

      await sql`
        INSERT INTO calls (call_id, lead_id, call_outcome, disconnection_reason, duration_ms, is_qualified, loan_amount_estimate, loan_purpose_confirmed, preferred_callback_time, call_summary, transcript, started_at, ended_at)
        VALUES (${callId}, ${lead.id}, ${f.call_outcome}, 'agent_hangup', ${f.duration_ms}, ${f.is_qualified}, ${f.loan_amount_estimate}, ${f.loan_purpose_confirmed}, ${f.preferred_callback_time}, ${f.call_summary}, ${f.transcript}, ${callStartedAt.toISOString()}, ${new Date(callStartedAt.getTime() + f.duration_ms).toISOString()})
      `;

      await sql`UPDATE leads SET last_call_id = ${callId} WHERE id = ${lead.id}`;
    }

    results.push({ id: lead.id, name: f.name, status: f.status, call_id: callId });
  }

  return NextResponse.json({ ok: true, seeded: results });
}
