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
  const page = await vaani("/api/call-history?page=1&page_size=50");
  const calls: VaaniCall[] = page?.data ?? [];
  const processed: string[] = [], skipped: string[] = [], errors: string[] = [];

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
