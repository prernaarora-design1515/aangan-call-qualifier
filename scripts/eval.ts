import fs from "node:fs";
import { assessCall } from "../lib/gemini";
import { decideStatus } from "../lib/rubric";
import { aiCostInr } from "../lib/costs";

/**
 * Runs Gemini over the 19 seed transcripts and compares its rubric outcome with the reviewed
 * labels in db/seed-calls.json. Use it whenever the prompt or model changes.
 */
(async () => {
  const seeds = JSON.parse(fs.readFileSync("db/seed-calls.json", "utf8"));
  let match = 0, cost = 0;
  for (const s of seeds) {
    const expected = decideStatus(s.assessment).status;
    const ai = await assessCall(s.transcript, new Date(s.started_at));
    const got = decideStatus(ai.assessment);
    cost += aiCostInr(ai.inputTokens, ai.outputTokens);
    const ok = got.status === expected;
    if (ok) match++;
    console.log(`${ok ? "✓" : "✗"} ${s.id}  expected=${expected.padEnd(10)} got=${got.status.padEnd(10)} ${ok ? "" : got.reasons.join(" | ")}`);
  }
  console.log(`\n${match}/${seeds.length} match · AI cost ₹${cost.toFixed(2)} (≈ ₹${(cost / seeds.length).toFixed(3)} per call)`);
})().catch((e) => { console.error(e); process.exit(1); });
