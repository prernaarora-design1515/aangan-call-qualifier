import { q } from "./db";
import { rates } from "./costs";
import { CallRow, CRITERIA, Criterion } from "./types";

export interface MonthStats {
  month: string; // YYYY-MM
  calls: CallRow[];
  total: number;
  afterHours: number;
  byStatus: Record<"good" | "unsure" | "bad" | "escalation", number>;
  forwarded: number;
  booked: number;
  pricingAsked: number;
  declineReasons: { criterion: Criterion | "out_of_scope"; count: number }[];
  perDay: { day: number; count: number; afterHours: number }[];
  cost: { voice: number; voiceActual: boolean; ai: number; email: number; fixed: number; total: number };
  avgDurationSec: number;
  handoffMinutes: number | null; // median call end -> email sent
}

export async function availableMonths(): Promise<string[]> {
  const rows = await q<{ m: string }>(
    `SELECT DISTINCT to_char(started_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS m FROM calls ORDER BY m DESC`
  );
  return rows.map((r) => r.m);
}

export async function monthStats(month: string): Promise<MonthStats> {
  const calls = await q<CallRow>(
    `SELECT * FROM calls
     WHERE to_char(started_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') = $1
     ORDER BY started_at DESC`,
    [month]
  );
  const n = (v: unknown) => Number(v ?? 0);
  const byStatus = { good: 0, unsure: 0, bad: 0, escalation: 0 };
  const decline: Record<string, number> = {};
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const perDay = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, count: 0, afterHours: 0 }));
  const handoffs: number[] = [];

  for (const c of calls) {
    byStatus[c.status]++;
    if (c.status === "bad") {
      if ((c as any).criteria && Object.keys(c.criteria).length) {
        let any = false;
        for (const k of CRITERIA) if (c.criteria[k]?.verdict === "fail") { decline[k] = (decline[k] ?? 0) + 1; any = true; }
        if (!any) decline.out_of_scope = (decline.out_of_scope ?? 0) + 1;
      }
    }
    const day = Number(new Date(c.started_at).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric" }));
    perDay[day - 1].count++;
    if (c.after_hours) perDay[day - 1].afterHours++;
    if (c.email_sent_at) {
      const end = new Date(c.started_at).getTime() + (c.duration_sec ?? 0) * 1000;
      handoffs.push((new Date(c.email_sent_at).getTime() - end) / 60000);
    }
  }
  handoffs.sort((a, b) => a - b);

  const voice = calls.reduce((s, c) => s + n(c.voice_cost_inr), 0);
  const ai = calls.reduce((s, c) => s + n(c.ai_cost_inr), 0);
  const email = calls.reduce((s, c) => s + n(c.email_cost_inr), 0);
  const fixed = calls.length ? rates.fixedMonthlyInr : 0;

  return {
    month,
    calls,
    total: calls.length,
    afterHours: calls.filter((c) => c.after_hours).length,
    byStatus,
    forwarded: byStatus.good + byStatus.unsure,
    booked: calls.filter((c) => c.booked_at).length,
    pricingAsked: calls.filter((c) => c.pricing_asked).length,
    declineReasons: Object.entries(decline)
      .map(([criterion, count]) => ({ criterion: criterion as Criterion, count }))
      .sort((a, b) => b.count - a.count),
    perDay,
    cost: {
      voice, voiceActual: calls.length > 0 && calls.every((c: any) => c.voice_cost_actual),
      ai, email, fixed, total: voice + ai + email + fixed,
    },
    avgDurationSec: calls.length ? calls.reduce((s, c) => s + (c.duration_sec ?? 0), 0) / calls.length : 0,
    handoffMinutes: handoffs.length ? handoffs[Math.floor(handoffs.length / 2)] : null,
  };
}

export const inr = (v: number, digits = 0) =>
  "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
