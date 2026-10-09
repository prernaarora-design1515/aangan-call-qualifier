/** Cost model — every rate is an env var so Nikhil's numbers match his actual plans. */
const num = (v: string | undefined, d: number) => (v && !isNaN(Number(v)) ? Number(v) : d);

export const rates = {
  usdInr: num(process.env.USD_INR, 88),
  geminiInUsdPerM: num(process.env.GEMINI_INPUT_USD_PER_M, 0.3),
  geminiOutUsdPerM: num(process.env.GEMINI_OUTPUT_USD_PER_M, 2.5),
  // Estimate used only until Vaani's `usage.charged` webhook reports the real debit for a call.
  vaaniInrPerMin: num(process.env.VAANI_INR_PER_MIN, 6),
  resendInrPerEmail: num(process.env.RESEND_INR_PER_EMAIL, 0), // free tier: 3,000 emails/month
  fixedMonthlyInr: num(process.env.FIXED_MONTHLY_INR, 0), // e.g. phone number rental; HubSpot/Neon/Vercel free tiers = 0
};

export function aiCostInr(inputTokens: number, outputTokens: number): number {
  const usd = (inputTokens * rates.geminiInUsdPerM + outputTokens * rates.geminiOutUsdPerM) / 1_000_000;
  return round(usd * rates.usdInr);
}

export function voiceCostEstimateInr(durationSec: number | null): number {
  return round(((durationSec ?? 0) / 60) * rates.vaaniInrPerMin);
}

export const round = (n: number) => Math.round(n * 100) / 100;
