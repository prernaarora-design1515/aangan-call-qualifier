import fs from "node:fs";
import { pool } from "../lib/db";
import { processCall } from "../lib/pipeline";

/**
 * Loads September 2026's phone enquiries (T01–T20, minus the missed call T08) as if the
 * AI qualifier had handled them, using reviewed assessments — no API calls, no emails.
 * `--reset` clears earlier seed rows first.
 */
(async () => {
  const seeds = JSON.parse(fs.readFileSync("db/seed-calls.json", "utf8"));
  if (process.argv.includes("--reset")) await pool.query("DELETE FROM calls WHERE source = 'seed'");
  for (const s of seeds) {
    const call = await processCall(
      {
        externalId: `seed_${s.id}`,
        source: "seed",
        callerPhone: null,
        startedAt: new Date(s.started_at),
        durationSec: s.duration_sec,
        transcript: s.transcript,
      },
      { assessment: s.assessment, skipIntegrations: true }
    );
    console.log(`${s.id}  ${call.status.padEnd(10)} ${call.scope_summary}`);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
