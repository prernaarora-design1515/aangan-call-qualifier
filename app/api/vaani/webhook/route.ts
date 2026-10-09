import { after, NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { processCall } from "@/lib/pipeline";
import { eventId, eventName, isAuthorised, parsePostprocessing, roomName } from "@/lib/vaani";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Trigger: Vaani AI (Settings → Webhooks) posts call events here.
 * We use `call_started` (caller's number) and `call_postprocessing` (transcript, after the call).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!isAuthorised(raw, req.nextUrl, req.headers.get("x-vaanivoice-signature"))) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const event = eventName(body);
  const id = eventId(body);

  // Dedupe retries: one row per event per call
  const inserted = await q(
    "INSERT INTO webhook_events (id, type, payload) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING RETURNING id",
    [id, event, raw]
  );
  if (!inserted.length) return NextResponse.json({ ok: true, duplicate: true });

  if (event === "call_postprocessing") {
    // Caller number + real start time come from the earlier call_started event for the same room
    const room = roomName(body);
    const [startedEvt] = room
      ? await q<{ payload: any; received_at: string }>(
          `SELECT payload, received_at FROM webhook_events
           WHERE type = 'call_started' AND (payload->>'room_name' = $1 OR payload->'data'->>'room_name' = $1)
           ORDER BY received_at LIMIT 1`,
          [room]
        )
      : [];
    const call = parsePostprocessing(body, {
      phone: startedEvt?.payload?.phone_number ?? startedEvt?.payload?.data?.phone_number ?? null,
      at: startedEvt ? new Date(startedEvt.received_at) : null,
    });
    if (!call.transcript.trim()) return NextResponse.json({ ok: true, skipped: "empty transcript" });

    // Respond fast; qualify + notify after the response is sent.
    after(async () => {
      try {
        await processCall({ ...call, source: "vaani" });
      } catch (e) {
        console.error("processCall failed", id, e);
        await q("DELETE FROM webhook_events WHERE id = $1", [id]); // let a retry reprocess
      }
    });
  }
  return NextResponse.json({ ok: true });
}
