import { NextRequest, NextResponse } from "next/server";
import { processCall } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Test the full pipeline without a phone call (protected by the dashboard password).
 * Body: { transcript, phone?, durationSec?, startedAt?, integrations?: boolean }
 */
export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.transcript) return NextResponse.json({ error: "transcript required" }, { status: 400 });
  const call = await processCall(
    {
      externalId: `sim_${Date.now()}`,
      source: "simulate",
      callerPhone: b.phone ?? null,
      startedAt: b.startedAt ? new Date(b.startedAt) : new Date(),
      durationSec: b.durationSec ?? 240,
      transcript: b.transcript,
    },
    { skipIntegrations: b.integrations === false }
  );
  return NextResponse.json(call);
}
