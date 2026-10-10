import fs from "node:fs";
import { pool } from "../lib/db";
import { processCall } from "../lib/pipeline";

/**
 * Loads (1) September 2026's phone enquiries as a baseline and (2) October demo calls,
 * as if the AI qualifier had handled them, using reviewed assessments — no API calls, no emails.
 * `--reset` clears earlier seed/demo rows first. Set SKIP_DEMO=1 to leave the demo data out.
 */
async function load(file: string, source: "seed" | "demo", prefix: string) {
  if (!fs.existsSync(file)) return;
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const s of rows) {
    const call = await processCall(
      {
        externalId: `${prefix}_${s.id}`,
        source,
        callerPhone: s.phone ?? null,
        startedAt: new Date(s.started_at),
        durationSec: s.duration_sec,
        transcript: s.transcript,
      },
      { assessment: s.assessment, skipIntegrations: true }
    );
    console.log(`${s.id}  ${call.status.padEnd(10)} ${call.scope_summary}`);
  }
}

(async () => {
  const reset = process.argv.includes("--reset");
  if (reset) await pool.query("DELETE FROM calls WHERE source IN ('seed','demo')");
  await load("db/seed-calls.json", "seed", "seed");

  if (process.env.SKIP_DEMO !== "1") {
    await load("db/demo-calls.json", "demo", "demo");
    // Demo rows look handled: designer emailed / founder alerted 2 minutes after the call
    await pool.query(`UPDATE calls SET email_sent_at = started_at + interval '2 minutes', hubspot_contact_id = 'demo'
                      WHERE source = 'demo' AND status IN ('good','unsure','escalation')`);
    await pool.query(`UPDATE calls SET hubspot_contact_id = 'demo' WHERE source = 'demo' AND status = 'bad'`);
    await pool.query("DELETE FROM outbound_calls WHERE demo");
    await pool.query(`INSERT INTO outbound_calls (phone, name, status, demo, created_at) VALUES
      ('+919822014411', 'Neha Kulkarni',   'completed', true, '2026-10-02T11:00:00+05:30'),
      ('+919767112233', 'Meera Nair',      'completed', true, '2026-10-09T17:10:00+05:30'),
      ('+919545667788', 'Sana Khan',       'no_answer', true, '2026-10-08T12:05:00+05:30'),
      ('+919011223344', 'Ananya Joshi',    'completed', true, '2026-10-04T10:30:00+05:30')`);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
