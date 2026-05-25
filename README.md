# SLAN Lead Qualification CRM

AI-powered lead callback and pipeline management system for SLAN Finance. Built by [Autifo](https://autifo.com).

**Live:** https://slan-crm.vercel.app (password protected)

---

## What it does

When a lead submits the [SLAN form](https://slan-form.vercel.app):

1. **`POST /api/leads`** — Creates lead row in Postgres, fires Retell AI outbound call within ~5 seconds.
2. **Retell agent (Alex)** calls the lead, qualifies them, attempts to book a callback.
3. **`POST /api/retell-webhook`** — Receives `call_analyzed` event, parses 9 custom analysis fields, routes the lead:
   - **Hot / booked** → SMS Ivan with lead details
   - **Wants link** → SMS lead with Calendly + notify Ivan
   - **No answer / voicemail** → Schedule retry (+4h, +24h, capped at 3 attempts)
   - **Bad number / wrong person / DNC** → Mark and stop
4. **`GET /api/cron/retries`** — Hit every 15 min by Make.com scheduled scenario. Sweeps `retry_pending` leads due now, fires next call (only during 9am–7pm Melbourne time).
5. **Dashboard** — Live-refreshing CRM (every 8s) with filterable lead table, drawer view showing transcript / AI summary / qualification fields / recording link.

---

## Tech stack

- **Framework:** Next.js 15 (App Router, JS not TS)
- **Database:** Neon Postgres (via Vercel Storage)
- **DB driver:** `@neondatabase/serverless` (wrapped in `lib/db.js` to mimic `@vercel/postgres` `{rows}` shape)
- **Voice AI:** Retell — agent `agent_deb9852210c006724126efc34d` (Alex, Noah voice, en-AU)
- **Telephony:** Telnyx — outbound +61480094137
- **SMS:** Telnyx Messaging API
- **Scheduler:** Make.com scenario `SLAN Retry Cron` (every 15 min) → hits `/api/cron/retries`
- **Auth:** Single shared password via httpOnly cookie (set in `CRM_PASSWORD` env)

---

## Project structure

```
app/
  layout.js                 Root layout, fonts
  page.js                   Auth-check entry, renders Dashboard or LoginScreen
  globals.css               All styles (navy + cream + gold theme)
  Dashboard.js              Client component: stats, table, filters, drawer
  LoginScreen.js            Client component: password gate
  api/
    auth/route.js           POST = login, DELETE = logout
    leads/route.js          POST = create+call lead, GET = list (auth required)
    leads/[id]/route.js     PATCH = update lead status/notes
    retell-webhook/route.js POST = Retell event handler with routing
    cron/retries/route.js   GET = retry sweep (Bearer auth via CRON_SECRET)
lib/
  db.js                     Neon client + schema bootstrap
  auth.js                   Cookie check
  integrations.js           Retell call + Telnyx SMS + retry timing
```

---

## Environment variables

Required on Vercel production:

| Variable | Purpose |
|---|---|
| `Storage_POSTGRES_URL` | Neon connection (auto-set by Vercel when you attach Postgres) |
| `RETELL_API_KEY` | Retell API auth |
| `RETELL_AGENT_ID` | SLAN agent ID |
| `RETELL_FROM_NUMBER` | Outbound caller ID (Telnyx number) |
| `TELNYX_API_KEY` | Telnyx Messaging auth |
| `TELNYX_FROM_NUMBER` | Outbound SMS sender |
| `IVAN_PHONE` | Broker mobile for hot-lead notifications |
| `CRM_PASSWORD` | Login password |
| `CRON_SECRET` | Bearer token validating Make.com retry pings |

---

## Lead status lifecycle

```
new → calling → (one of:)
  hot              (booked a time — SMS sent to Ivan)
  send_link        (asked for SMS link — sent to lead + Ivan)
  retry_pending    (no answer, waiting on next attempt)
  bad_number       (Telnyx failed — invalid/blocked dest)
  wrong_number     (Alex confirmed wrong person)
  not_interested   (declined)
  dnc              (asked to stop contact)
  dead             (3 attempts exhausted)
```

---

## Retry cadence

- Attempt 1: Immediate (on form submission)
- Attempt 2: +4 hours
- Attempt 3: +24 hours from original
- After attempt 3: status `dead`

All retries gated to 9am–7pm Melbourne time. Out-of-hours scheduling pushes to next 9am.

---

## Local development

```bash
npm install
# Create .env.local with the env vars above (use a dev Postgres + dev Retell agent)
npm run dev
```

App runs on http://localhost:3000.

---

## Deployment

Pushed to `main` branch → Vercel auto-deploys (assuming git integration is set up in the Vercel project).

The Make.com retry scenario is independent — see Make workspace, scenario "SLAN Retry Cron" (id 9284847).
