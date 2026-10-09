import { NextRequest, NextResponse } from "next/server";
import { syncFromVaani } from "@/lib/vaani-sync";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Pull finished calls from Vaani AI. Called by:
 *  - the GitHub Actions schedule (.github/workflows/vaani-sync.yml) every few minutes
 *  - Vercel's daily cron (vercel.json) as a backstop
 * Auth: ?key=<VAANI_WEBHOOK_SECRET>, or Vercel cron's "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const bearer = req.headers.get("authorization");
  const ok =
    (process.env.VAANI_WEBHOOK_SECRET && key === process.env.VAANI_WEBHOOK_SECRET) ||
    (process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`);
  if (!ok) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  try {
    return NextResponse.json(await syncFromVaani());
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message ?? e) }, { status: 500 });
  }
}
