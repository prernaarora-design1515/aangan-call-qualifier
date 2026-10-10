# Aangan Call Qualifier

Every call to Aangan Studio is answered in seconds, day or night. Each caller is checked against
Nikhil's five-point rubric. Worthwhile leads reach a designer by email with everything already asked,
and a dashboard shows what the system is generating and what it costs to run.

```
Caller ──► Vaani AI voice agent ──(call_postprocessing webhook)──► /api/vaani/webhook?key=…
            │  prompt: prompts/voice-agent.md                             │
            │  knowledge: services.md, pricing.md, qualified.md           ├─► Gemini Flash: evidence per criterion
            │  tools: get_slots / book_consultation ──► Cal.com           ├─► lib/rubric.ts: Good / Unsure / Bad / Escalation
            ▼                                                             ├─► Neon (calls table)
       consultation booked on the call                                    ├─► HubSpot: contact + note (+ deal if Good)
                                                                          └─► Resend: designer email (Good/Unsure)
                                                                                      founder email (Escalation)
Founder ──► Vercel dashboard (/) — calls, lead mix, decline reasons, cost to run
```

| Stack (from class) | Role here |
|---|---|
| Claude Chat | Built the qualification logic → `prompts/voice-agent.md`, `lib/rubric.ts` |
| Claude Code | This repo |
| Vaani AI (app.vaanivoice.ai) | Voice, telephony, call orchestration; sends `call_started` + `call_postprocessing` webhooks |
| Gemini Flash | Reads the transcript and judges each of the 5 criteria (cheap, fast) |
| Cal.com | Consultation booking inside the call (`/api/tools/*`) |
| HubSpot | CRM: every call logged; Good calls become deals |
| Neon | Call log and state |
| Resend | Designer handoff email (chosen over Telegram) |
| Vercel | Hosts the dashboard and API |
| GitHub | This repo; Vercel deploys from it |

## Design decisions

- **The AI judges the evidence and code makes the decision.** Gemini returns pass, fail or unclear for each
  criterion, with evidence. `lib/rubric.ts` applies `qualified.md` deterministically, so every outcome
  can be audited:
  - Any criterion fails, or the request is out of scope → **Bad**. The call is closed politely and logged in HubSpot only.
  - Any criterion unclear → **Unsure**. The lead is forwarded, and the open questions are listed in the email.
  - Everything passes → **Good**. The lead is forwarded, and a HubSpot deal is created.
  - An existing client with a complaint → **Escalation**. Nikhil gets an email immediately.
- **No pricing on calls (the Cut).** Nikhil asked for the agent to quote per-sq-ft prices, but
  `pricing.md` says no number may ever be quoted. The agent deflects to the consultation instead.
  `pricing.md` is never sent to the classifier, so a price can't leak into an email either.
- **Email instead of Telegram.** It sits alongside the HubSpot record, is searchable and easy to forward,
  and each designer needs no extra app.
- **Cost is a first-class metric.** Gemini's token usage is priced for every call. Vaani AI's webhooks
  don't report cost, so voice cost uses the agent's per-minute rate (`VAANI_INR_PER_MIN`, ₹5.60). All rates are env vars.
- **Reliability.** Vaani AI webhooks are unsigned, so the webhook URL carries a secret (`?key=`).
  Events are deduplicated per call, and the endpoint responds before qualification runs.
  A pull-based sync (`/api/vaani/sync`, GitHub Action every 5 min, needs `VAANI_API_KEY`) is a backstop. If HubSpot or Resend fails, the
  error is recorded on the call and the call itself is kept.

## Setup

1. **Neon**: create a project and copy its connection string into `DATABASE_URL`.
2. `cp .env.example .env.local`, then fill in the keys.
3. `npm install`, then `npm run db:migrate`, then `npm run db:seed` (loads the 19 September phone calls as a baseline). On Vercel, `npm run build` does both automatically whenever `DATABASE_URL` is set.
4. `npm run dev`, then open http://localhost:3000. The dashboard password is `DASHBOARD_PASSWORD`; any username works.
5. **Gemini check**: `npm run eval` runs Gemini over the 19 seed calls and compares its outcomes with the reviewed labels.
6. **Deploy**: push to GitHub, import the repo in Vercel, and add every variable from `.env.example`.
7. **Vaani AI** (app.vaanivoice.ai):
   - Agent system prompt: `prompts/voice-agent.md`. Knowledge base: `services.md` and `qualified.md` (pricing.md is left out on purpose).
   - Developers → Webhooks: `https://<app>.vercel.app/api/vaani/webhook?key=<VAANI_WEBHOOK_SECRET>`, events Call Started + Call Post-Processing.
   - Optional in-call booking tools (header `x-tool-secret: <TOOL_SECRET>`) — currently off, see Status:
     - `get_slots` → `GET /api/tools/slots`
     - `book_consultation` → `POST /api/tools/book` with `{ start, name, phone, email?, summary, call_id }`
8. **HubSpot**: create a private app with contacts and deals read/write scopes, and put its token in `HUBSPOT_TOKEN`.
9. **Resend**: verify the sending domain, then set `EMAIL_FROM`, `DESIGNER_EMAILS` and `FOUNDER_EMAIL`.
10. **Cal.com**: create a "Free consultation" event type, then set `CALCOM_API_KEY` and `CALCOM_EVENT_TYPE_ID`.

Test without a phone call (signed in to the dashboard):

```bash
curl -u x:$DASHBOARD_PASSWORD -X POST https://<app>.vercel.app/api/dev/simulate \
  -H 'content-type: application/json' \
  -d '{"transcript":"Agent: Aangan Studio...\nCaller: Hi, 2BHK in Baner, full redesign, by March. I am the owner."}'
```

## Call a lead (outbound)

The dashboard header has a **☎ Call a lead** button. Enter a number (10-digit Indian numbers get +91 added)
and an optional name, and Aanya calls it through Vaani's `POST /api/trigger-call/`. The call is then qualified
and logged like any inbound call. Route: `app/api/outbound/route.ts` (dashboard password + `x-aangan-dialer`
header, 10 calls/hour via `OUTBOUND_HOURLY_LIMIT`). Placed calls go in the `outbound_calls` table; the sync
fetches their transcripts by call id, so they don't depend on Vaani's call-history endpoint.
Needs `VAANI_API_KEY` and `VAANI_AGENT_ID`.

## Demo data

`db/demo-calls.json` holds 14 October demo calls (tagged DEMO on the dashboard) plus 4 demo outbound calls,
loaded on every build by `scripts/seed.ts`. Set `SKIP_DEMO=1` in Vercel and redeploy to remove them.

## Status (Oct 2026)

- Live on Vercel with Neon; September calls seeded as a baseline.
- Vaani agent "Aanya" set up with prompt, knowledge base and webhook. No inbound number yet: a normal mobile
  can't be imported, it needs a SIP trunk (Exotel/Plivo/Twilio) or a number bought in Vaani.
- In-call booking is off: Vaani custom tools save but stay hidden, so they can't be attached. Qualified callers
  are told a designer will call back to fix the consultation; the designer email carries everything.
- Resend is in test mode (onboarding@resend.dev), so emails only reach the account owner until a domain is verified.
- Gemini 2.5 Flash was retired by Google; production uses `GEMINI_MODEL=gemini-3.8-flash`.
- Vaani's `GET /api/call-history` returns "Invalid client_id format" for this account (a Vaani-side issue), so
  inbound calls rely on the webhook; dashboard-placed calls are fetched by id.
- Tested end to end with `/api/dev/simulate`: Gemini → rubric → HubSpot contact/deal → designer and founder emails.

## Not built yet

- **WhatsApp and web form.** Each channel would need its own adapter calling `processCall()` with its
  transcript, and everything downstream is shared. Vaani Labs already supports WhatsApp.
- **Fields Vaani doesn't document.** Vaani doesn't document every field in the `call.completed` payload,
  so `lib/vaani.ts` reads the common shapes defensively. Check one real payload in the `webhook_events`
  table and adjust if a field is missing.

## Layout

```
app/                 dashboard (/), call detail (/calls/[id]), API routes
app/fx.tsx           ASCII voice wave, count-ups, scramble text, spinner
app/dialer.tsx       "Call a lead" panel
lib/pipeline.ts      processCall(): AI → rubric → DB → HubSpot → email
lib/rubric.ts        qualified.md as code
lib/gemini.ts        classifier prompt + JSON schema
prompts/             Vaani agent system prompt
knowledge/           services.md, pricing.md, qualified.md
db/                  schema.sql, seed-calls.json (Sept transcripts + reviewed labels), demo-calls.json (Oct demo)
scripts/             migrate, seed, eval
```
