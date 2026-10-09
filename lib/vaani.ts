import crypto from "node:crypto";

/**
 * Vaani AI (app.vaanivoice.ai) webhooks are not signed, so the webhook URL carries a secret:
 *   https://<app>/api/vaani/webhook?key=<VAANI_WEBHOOK_SECRET>
 * A signed "X-VaaniVoice-Signature: sha256=<hmac>" header is also accepted, if the platform adds signing.
 */
export function isAuthorised(rawBody: string, url: URL, signature: string | null): boolean {
  const secret = process.env.VAANI_WEBHOOK_SECRET;
  if (!secret) return false;
  const given = url.searchParams.get("key");
  if (given && safeEqual(given, secret)) return true;
  if (signature) {
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    return safeEqual(signature.trim(), expected);
  }
  return false;
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const pick = (o: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = k.split(".").reduce((x, p) => (x == null ? x : x[p]), o);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
};

/** Event name: Vaani AI sends `event`; other envelopes use `type`. */
export const eventName = (b: any): string => String(b?.event ?? b?.type ?? "unknown");

/** Stable id for dedupe: same event for the same call is processed once. */
export function eventId(b: any): string {
  const callRef = pick(b, "call_id", "data.call_id", "room_name", "data.room_name", "id") ?? crypto.randomUUID();
  return `${eventName(b)}:${callRef}`;
}

export const roomName = (b: any): string | null => pick(b, "room_name", "data.room_name");

/** "AGENT: ...\n\n USER: ..." (or an array of turns) → "Agent: ...\nCaller: ..." */
export function normaliseTranscript(raw: unknown): string {
  if (typeof raw === "string") {
    return raw
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/^(AGENT|ASSISTANT|BOT)\s*:/i, "Agent:").replace(/^(USER|CUSTOMER|CALLER)\s*:/i, "Caller:"))
      .join("\n");
  }
  if (Array.isArray(raw)) {
    return raw
      .map((m: any) => {
        const role = String(m.role ?? m.speaker ?? "").toLowerCase();
        const who = /assistant|agent|bot/.test(role) ? "Agent" : "Caller";
        return `${who}: ${m.text ?? m.content ?? m.message ?? ""}`;
      })
      .join("\n");
  }
  return "";
}

/**
 * `call_postprocessing` (Vaani AI): { event, call_id, timestamp, data: { room_name, call_id,
 * call_duration (ms), end_reason, summary, entities, dispositions, recording_url, transcript } }
 */
export function parsePostprocessing(b: any, started?: { phone: string | null; at: Date | null }) {
  const d = b?.data ?? b ?? {};
  const durMs = Number(pick(d, "call_duration") ?? 0);
  const durationSec = durMs ? Math.round(durMs / 1000) : null; // docs: milliseconds
  const ts = pick(b, "timestamp", "data.timestamp");
  const endAt = ts ? new Date(typeof ts === "number" ? ts * (ts < 1e12 ? 1000 : 1) : ts) : new Date();
  const startedAt = started?.at ?? new Date(endAt.getTime() - (durationSec ?? 0) * 1000);

  return {
    externalId: String(pick(b, "call_id", "data.call_id", "data.room_name", "room_name")),
    callerPhone: started?.phone ?? pick(d, "phone_number", "from", "caller_number"),
    startedAt,
    durationSec,
    transcript: normaliseTranscript(pick(d, "transcript", "transcription")),
    voiceCostInr: (() => {
      const c = pick(d, "cost", "cost_inr", "call_cost");
      return c != null && !isNaN(Number(c)) ? Number(c) : null;
    })(),
  };
}
