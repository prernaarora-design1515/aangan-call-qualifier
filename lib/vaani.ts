import crypto from "node:crypto";

/** Verifies X-VaaniVoice-Signature: "sha256=<hex HMAC-SHA256 of raw body>" keyed with the vv_whk_ secret. */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.VAANI_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header.trim());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface VaaniEnvelope {
  id: string;
  type: string;
  created: number;
  data: Record<string, any>;
}

const pick = (o: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = k.split(".").reduce((x, p) => (x == null ? x : x[p]), o);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
};

/**
 * Vaani documents `data` as event-specific with no guaranteed sub-fields,
 * so we read the common shapes defensively.
 */
export function parseCallCompleted(evt: VaaniEnvelope) {
  const d = evt.data ?? {};
  const raw = pick(d, "transcript", "call.transcript", "messages", "conversation");
  let transcript = "";
  if (typeof raw === "string") transcript = raw;
  else if (Array.isArray(raw)) {
    transcript = raw
      .map((m: any) => {
        const role = String(m.role ?? m.speaker ?? "").toLowerCase();
        const who = /assistant|agent|bot/.test(role) ? "Agent" : "Caller";
        return `${who}: ${m.text ?? m.content ?? m.message ?? ""}`;
      })
      .join("\n");
  }
  const started = pick(d, "started_at", "start_time", "call.started_at", "created_at");
  const startedAt = started
    ? new Date(typeof started === "number" ? started * (started < 1e12 ? 1000 : 1) : started)
    : new Date(evt.created * 1000);
  const durationRaw = pick(d, "duration_seconds", "duration_sec", "duration", "call.duration");
  const costRaw = pick(d, "cost_inr", "cost", "charge.amount", "amount");

  return {
    externalId: String(pick(d, "call_id", "session_id", "id", "call.id") ?? evt.id),
    callerPhone: pick(d, "from", "caller", "caller_number", "phone", "customer.phone", "call.from"),
    startedAt,
    durationSec: durationRaw != null ? Math.round(Number(durationRaw)) : null,
    transcript,
    voiceCostInr: costRaw != null && !isNaN(Number(costRaw)) ? Number(costRaw) : null,
  };
}

/** `usage.charged` → the actual wallet debit, linked back to a call when an id is present. */
export function parseUsageCharged(evt: VaaniEnvelope) {
  const d = evt.data ?? {};
  return {
    callId: pick(d, "call_id", "session_id", "reference_id", "call.id"),
    amountInr: Number(pick(d, "amount_inr", "amount", "charge.amount") ?? 0),
  };
}
