import { q } from "./db";
import { assessCall } from "./gemini";
import { decideStatus, FORWARD_TO_DESIGNER } from "./rubric";
import { aiCostInr, rates, voiceCostEstimateInr } from "./costs";
import { syncToHubSpot } from "./hubspot";
import { sendDesignerHandoff, sendEscalation } from "./email";
import { Assessment, CallInput, CallRow } from "./types";

/** Studio front-desk hours are 10am–7pm IST; anything else counts as after hours. */
export function isAfterHours(d: Date): boolean {
  const h = Number(d.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }));
  return h < 10 || h >= 19;
}

interface Options {
  /** Pre-computed assessment (seed data) — skips the AI call. */
  assessment?: Assessment;
  /** Skip HubSpot + email (seed data / dry runs). */
  skipIntegrations?: boolean;
}

/**
 * Trigger → Input → Context → Processing → AI → Output, for one finished call.
 * Returns the stored call. Integration failures are recorded on the row, never thrown,
 * so one flaky API can't lose the call.
 */
export async function processCall(input: CallInput, opts: Options = {}): Promise<CallRow> {
  const existing = await q<CallRow>("SELECT * FROM calls WHERE external_id = $1", [input.externalId]);
  if (existing[0]) return existing[0];

  // AI: evidence per criterion (Gemini Flash), then the rubric decides in code
  let assessment = opts.assessment;
  let inTok = 0, outTok = 0, model: string | null = null;
  if (!assessment) {
    const ai = await assessCall(input.transcript, input.startedAt);
    assessment = ai.assessment;
    inTok = ai.inputTokens; outTok = ai.outputTokens; model = ai.model;
  }
  const { status, reasons } = decideStatus(assessment);

  const voiceActual = input.voiceCostInr != null;
  const voiceCost = voiceActual ? input.voiceCostInr! : voiceCostEstimateInr(input.durationSec);

  const [row] = await q<CallRow>(
    `INSERT INTO calls (external_id, source, caller_name, caller_phone, started_at, duration_sec, after_hours,
       transcript, status, intent, project_type, scope_summary, location, carpet_area_sqft, timeline,
       budget_mentioned, criteria, reasons, open_questions, pricing_asked, caller_frustrated, handoff_note,
       voice_cost_inr, voice_cost_actual, ai_cost_inr, ai_input_tokens, ai_output_tokens, ai_model)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
     ON CONFLICT (external_id) DO NOTHING
     RETURNING *`,
    [
      input.externalId, input.source, assessment.caller_name, input.callerPhone, input.startedAt,
      input.durationSec, isAfterHours(input.startedAt), input.transcript, status, assessment.intent,
      assessment.project_type, assessment.scope_summary, assessment.location,
      assessment.carpet_area_sqft != null ? Math.round(assessment.carpet_area_sqft) : null,
      assessment.timeline, assessment.budget_mentioned, JSON.stringify(assessment.criteria),
      JSON.stringify(reasons), JSON.stringify(assessment.open_questions), assessment.pricing_asked,
      assessment.caller_frustrated, assessment.handoff_note, voiceCost, voiceActual,
      aiCostInr(inTok, outTok), inTok, outTok, model,
    ]
  );
  if (!row) return (await q<CallRow>("SELECT * FROM calls WHERE external_id = $1", [input.externalId]))[0];

  // Link a consultation booked during this call (Cal.com tool)
  const [booking] = await q(
    `SELECT * FROM bookings WHERE call_ref = $1
        OR (caller_phone IS NOT NULL AND caller_phone = $2 AND created_at > $3::timestamptz - interval '2 hours')
     ORDER BY created_at DESC LIMIT 1`,
    [input.externalId, input.callerPhone, input.startedAt]
  );
  if (booking) {
    await q("UPDATE calls SET booked_at = $1, booking_id = $2 WHERE id = $3", [booking.slot_start, booking.booking_id, row.id]);
    row.booked_at = booking.slot_start;
  }

  if (opts.skipIntegrations) return row;

  const errors: string[] = [];

  // Output 1: HubSpot record
  if (process.env.HUBSPOT_TOKEN) {
    try {
      const { contactId, dealId } = await syncToHubSpot(row);
      await q("UPDATE calls SET hubspot_contact_id = $1, hubspot_deal_id = $2 WHERE id = $3", [contactId, dealId, row.id]);
      row.hubspot_contact_id = contactId;
    } catch (e: any) { errors.push(String(e.message ?? e)); }
  }

  // Output 2: email — designer handoff (good/unsure) or founder escalation
  if (process.env.RESEND_API_KEY) {
    try {
      let sent = false;
      if (FORWARD_TO_DESIGNER.includes(status)) { await sendDesignerHandoff(row); sent = true; }
      else if (status === "escalation") { await sendEscalation(row); sent = true; }
      if (sent) {
        await q("UPDATE calls SET email_sent_at = now(), email_cost_inr = $1 WHERE id = $2", [rates.resendInrPerEmail, row.id]);
      }
    } catch (e: any) { errors.push(String(e.message ?? e)); }
  }

  if (errors.length) await q("UPDATE calls SET errors = $1 WHERE id = $2", [JSON.stringify(errors), row.id]);
  return (await q<CallRow>("SELECT * FROM calls WHERE id = $1", [row.id]))[0];
}
