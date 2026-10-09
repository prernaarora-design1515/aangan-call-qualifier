import { after, NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { processCall } from "@/lib/pipeline";
import { parseCallCompleted, parseUsageCharged, VaaniEnvelope, verifySignature } from "@/lib/vaani";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Trigger: Vaani Labs posts signed events here when a call ends. */
export async function POST(req: NextRequest) {
  const raw = await req.text(); // raw bytes are needed for the HMAC check
  if (!verifySignature(raw, req.headers.get("x-vaanivoice-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const evt = JSON.parse(raw) as VaaniEnvelope;
  if (evt.type === "webhook.ping") return NextResponse.json({ ok: true });

  // Vaani retries deliveries — dedupe on the envelope id
  const inserted = await q(
    "INSERT INTO webhook_events (id, type, payload) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING RETURNING id",
    [evt.id, evt.type, raw]
  );
  if (!inserted.length) return NextResponse.json({ ok: true, duplicate: true });

  if (evt.type === "call.completed") {
    const call = parseCallCompleted(evt);
    if (!call.transcript.trim()) return NextResponse.json({ ok: true, skipped: "empty transcript" });
    // Acknowledge within Vaani's 10s timeout; qualify + notify after responding.
    after(async () => {
      try {
        await processCall({ ...call, source: "vaani" });
      } catch (e) {
        console.error("processCall failed", evt.id, e);
        await q("DELETE FROM webhook_events WHERE id = $1", [evt.id]); // allow a retry to reprocess
      }
    });
  } else if (evt.type === "usage.charged") {
    const u = parseUsageCharged(evt);
    if (u.callId && u.amountInr > 0) {
      await q(
        "UPDATE calls SET voice_cost_inr = $1, voice_cost_actual = TRUE WHERE external_id = $2",
        [u.amountInr, String(u.callId)]
      );
    }
  }
  return NextResponse.json({ ok: true });
}
