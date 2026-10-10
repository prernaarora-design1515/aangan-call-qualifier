import { q } from "./db";
import { processCall } from "./pipeline";
import { normaliseTranscript } from "./vaani";

/**
 * Pull-based fallback for when Vaani AI webhooks aren't available on the account:
 * reads recent calls from the Vaani API and processes any finished call we haven't seen.
 * Docs: GET /api/call-history, GET /api/transcript/{call_id}, header X-API-Key.
 */
const BASE = process.env.VAANI_API_BASE || "https://api.vaanivoice.ai";

async function vaani(path: string) {
  const res = await fetch(BASE + path, {
    headers: { "X-API-Key": process.env.VAANI_API_KEY ?? "" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Vaani ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

interface VaaniCall {
  call_id: string;
  from_number?: string;
  to_number?: string;
  direction?: string;
  Start_time?: string;
  End_time?: string;
  duration_ms?: number;
  post_processing_status?: string;
}

export async function syncFromVaani(limit = 8): Promise<{ checked: number; processed: string[]; skipped: string[]; errors: string[] }> {
  if (!process.env.VAANI_API_KEY) throw new Error("VAANI_API_KEY is not set");
  const processed: string[] = [], skipped: string[] = [], errors: string[] = [];

  // Calls placed from the dashboard: mark them done once their call row exists (webhook or sync)
  await q(`UPDATE outbound_calls o SET status = 'completed' FROM calls c
           WHERE o.status = 'dialing' AND o.vaani_call_id IS NOT NULL AND c.external_id = o.vaani_call_id`).catch(() => {});

  // Call history can fail on Vaani's side for some accounts — fall back to known call ids below
  let calls: VaaniCall[] = [];
  try {
    const page = await vaani("/api/call-history?page=1&page_size=50");
    calls = page?.data ?? [];
  } catch (e: any) {
    errors.push(`call-history: ${String(e.message ?? e).slice(0, 160)}`);
  }

  // Outbound calls we triggered ourselves: we know their ids, so fetch transcripts directly
  const pending = await q<{ id: number; vaani_call_id: string; phone: string; created_at: string }>(
    `SELECT o.id, o.vaani_call_id, o.phone, o.created_at FROM outbound_calls o
      WHERE o.status = 'dialing' AND o.vaani_call_id IS NOT NULL AND o.created_at > now() - interval '2 days'
        AND NOT EXISTS (SELECT 1 FROM calls c WHERE c.external_id = o.vaani_call_id)
      ORDER BY o.created_at DESC LIMIT 5`
  ).catch(() => []);
  for (const o of pending) {
    try {
      const t = await vaani(`/api/transcript/${encodeURIComponent(o.vaani_call_id)}`);
      const transcript = normaliseTranscript(t?.transcript ?? t?.transcription);
      if (!transcript) { skipped.push(o.vaani_call_id); continue; }
      await processCall({
        externalId: o.vaani_call_id,
        source: "vaani",
        callerPhone: o.phone,
        startedAt: new Date(o.created_at),
        durationSec: null,
        transcript,
      });
      await q("UPDATE outbound_calls SET status = 'completed' WHERE id = $1", [o.id]);
      processed.push(o.vaani_call_id);
    } catch (e: any) {
      const msg = String(e.message ?? e);
      // not ready yet (call still running / no answer) — try again on the next sync
      if (/ 404|not found/i.test(msg)) {
        if (Date.now() - new Date(o.created_at).getTime() > 30 * 60_000)
          await q("UPDATE outbound_calls SET status = 'no_answer' WHERE id = $1", [o.id]);
        skipped.push(o.vaani_call_id);
      } else errors.push(`${o.vaani_call_id}: ${msg.slice(0, 160)}`);
    }
  }

  const ids = calls.map((c) => c.call_id).filter(Boolean);
  const known = new Set(
    ids.length ? (await q<{ external_id: string }>("SELECT external_id FROM calls WHERE external_id = ANY($1)", [ids])).map((r) => r.external_id) : []
  );

  for (const c of calls) {
    if (processed.length >= limit) break;
    if (!c.call_id || known.has(c.call_id)) continue;
    if (/pending|progress|queued|processing/i.test(c.post_processing_status ?? "")) { skipped.push(c.call_id); continue; }
    try {
      const t = await vaani(`/api/transcript/${encodeURIComponent(c.call_id)}`);
      const transcript = normaliseTranscript(t?.transcript ?? t?.transcription);
      if (!transcript || t?.status_code === 404) { skipped.push(c.call_id); continue; }
      const incoming = /in/i.test(c.direction ?? "") && !/out/i.test(c.direction ?? "");
      await processCall({
        externalId: c.call_id,
        source: "vaani",
        callerPhone: (incoming ? c.from_number : c.to_number) ?? null,
        startedAt: c.Start_time ? new Date(c.Start_time) : new Date(),
        durationSec: c.duration_ms ? Math.round(c.duration_ms / 1000) : null,
        transcript,
      });
      processed.push(c.call_id);
    } catch (e: any) {
      errors.push(`${c.call_id}: ${String(e.message ?? e).slice(0, 200)}`);
    }
  }
  return { checked: calls.length, processed, skipped, errors };
}
