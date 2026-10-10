import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Call a lead" — places an outbound call through the Vaani agent.
 * Protected by the dashboard password (middleware) + a custom header so other sites can't trigger it.
 * Docs: POST https://api.vaanivoice.ai/api/trigger-call/  (X-API-Key, agent_id, contact_number, name)
 */
const BASE = process.env.VAANI_API_BASE || "https://api.vaanivoice.ai";
const HOURLY_LIMIT = Number(process.env.OUTBOUND_HOURLY_LIMIT ?? 10);

function normalisePhone(raw: string): string | null {
  let p = String(raw ?? "").replace(/[\s\-().]/g, "");
  if (/^0\d{10}$/.test(p)) p = p.slice(1);
  if (/^[6-9]\d{9}$/.test(p)) p = "+91" + p;          // Indian mobile without country code
  if (/^91[6-9]\d{9}$/.test(p)) p = "+" + p;
  return /^\+\d{10,15}$/.test(p) ? p : null;
}

export async function GET() {
  const rows = await q("SELECT * FROM outbound_calls ORDER BY created_at DESC LIMIT 8").catch(() => []);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-aangan-dialer") !== "1") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const phone = normalisePhone(body.phone);
  const name = String(body.name ?? "").trim().slice(0, 60) || "there";
  if (!phone) return NextResponse.json({ error: "Enter a valid number, e.g. 98765 43210 or +91 98765 43210" }, { status: 400 });

  if (!process.env.VAANI_API_KEY || !process.env.VAANI_AGENT_ID) {
    return NextResponse.json(
      { error: "Calling isn't switched on yet — add VAANI_API_KEY and VAANI_AGENT_ID in Vercel, then redeploy." },
      { status: 503 }
    );
  }

  const [{ n }] = await q<{ n: number }>(
    "SELECT count(*)::int AS n FROM outbound_calls WHERE NOT demo AND created_at > now() - interval '1 hour'"
  );
  if (n >= HOURLY_LIMIT) return NextResponse.json({ error: `Limit reached: ${HOURLY_LIMIT} calls per hour.` }, { status: 429 });

  let callId: string | null = null, error: string | null = null;
  try {
    const res = await fetch(`${BASE}/api/trigger-call/`, {
      method: "POST",
      headers: { "X-API-Key": process.env.VAANI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: process.env.VAANI_AGENT_ID,
        medium: "telephony",
        contact_number: phone,
        name,
        ...(process.env.VAANI_OUTBOUND_NUMBER ? { outbound_number: process.env.VAANI_OUTBOUND_NUMBER } : {}),
        metadata: { source: "dashboard", name },
      }),
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.success === false || j?.error) {
      error = j?.error || j?.message || (Array.isArray(j?.detail) ? j.detail.map((d: any) => d.msg).join("; ") : j?.detail) || `Vaani ${res.status}`;
    } else {
      callId = j?.output?.call_id ?? null;
    }
  } catch (e: any) {
    error = String(e?.message ?? e);
  }

  const [row] = await q(
    "INSERT INTO outbound_calls (phone, name, status, vaani_call_id, error) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [phone, name === "there" ? null : name, error ? "failed" : "dialing", callId, error]
  );
  return NextResponse.json(error ? { error, row } : { ok: true, row }, { status: error ? 502 : 200 });
}
