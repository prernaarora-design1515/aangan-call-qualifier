# Aangan Call Qualifier

Every call to Aangan Studio is answered in seconds, day or night. Each caller is checked against
Nikhil's five-point rubric. Worthwhile leads reach a designer by email with everything already asked,
and a dashboard shows what the system is generating and what it costs to run.

```
Caller ──► Vaani Labs voice agent ──(signed call.completed webhook)──► /api/vaani/webhook
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
| Vaani Labs | Voice, telephony, call orchestration; sends `call.completed` + `usage.charged` webhooks |
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
- **Cost is a first-class metric.** Gemini's token usage is priced for every call. Voice cost uses Vaani's
  `usage.charged` debit when it arrives, and is estimated until then. All rates are env vars.
- **Reliability.** Webhooks are HMAC-verified and deduplicated on the event id. The endpoint responds
  within Vaani's 10-second limit, and qualification runs afterwards. If HubSpot or Resend fails, the
  error is recorded on the call and the call itself is kept.

## Setup

1. **Neon**: create a project and copy its connection string into `DATABASE_URL`.
2. `cp .env.example .env.local`, then fill in the keys.
3. `npm install`, then `npm run db:migrate`, then `npm run db:seed` (loads the 19 September phone calls as a baseline). On Vercel, `npm run build` does both automatically whenever `DATABASE_URL` is set.
4. `npm run dev`, then open http://localhost:3000. The dashboard password is `DASHBOARD_PASSWORD`; any username works.
5. **Gemini check**: `npm run eval` runs Gemini over the 19 seed calls and compares its outcomes with the reviewed labels.
6. **Deploy**: push to GitHub, import the repo in Vercel, and add every variable from `.env.example`.
7. **Vaani Labs**:
   - Agent system prompt: `prompts/voice-agent.md`. Knowledge base: the three files in `knowledge/`.
   - Webhook: `https://<app>.vercel.app/api/vaani/webhook`, subscribed to `call.completed` and `usage.charged`.
     Copy the signing secret into `VAANI_WEBHOOK_SECRET`.
   - HTTP tools (header `x-tool-secret: $TOOL_SECRET`):
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

## Not built yet

- **WhatsApp and web form.** Each channel would need its own adapter calling `processCall()` with its
  transcript, and everything downstream is shared. Vaani Labs already supports WhatsApp.
- **Fields Vaani doesn't document.** Vaani doesn't document every field in the `call.completed` payload,
  so `lib/vaani.ts` reads the common shapes defensively. Check one real payload in the `webhook_events`
  table and adjust if a field is missing.

## Layout

```
app/                 dashboard (/), call detail (/calls/[id]), API routes
lib/pipeline.ts      processCall(): AI → rubric → DB → HubSpot → email
lib/rubric.ts        qualified.md as code
lib/gemini.ts        classifier prompt + JSON schema
prompts/             Vaani agent system prompt
knowledge/           services.md, pricing.md, qualified.md
db/                  schema.sql, seed-calls.json (Sept transcripts + reviewed labels)
scripts/             migrate, seed, eval
```
