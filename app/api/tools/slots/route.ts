import { NextRequest, NextResponse } from "next/server";
import { getSlots } from "@/lib/calcom";
import { toolAuthError } from "@/lib/tool-auth";

export const runtime = "nodejs";

/** Voice-agent tool `get_slots`: next available consultation slots, phrased for speech. */
async function handle(req: NextRequest) {
  const denied = toolAuthError(req);
  if (denied) return denied;
  try {
    const slots = await getSlots(7);
    const spoken = slots.slice(0, 6).map((s) => ({
      start: s,
      say: new Date(s).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
      }),
    }));
    return NextResponse.json({ slots: spoken });
  } catch (e: any) {
    return NextResponse.json(
      { slots: [], message: "Booking is unavailable right now — tell the caller a designer will call back within one working day." },
      { status: 200 }
    );
  }
}
export const GET = handle;
export const POST = handle;
