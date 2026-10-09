import { NextRequest, NextResponse } from "next/server";
import { bookConsultation } from "@/lib/calcom";
import { q } from "@/lib/db";
import { toolAuthError } from "@/lib/tool-auth";

export const runtime = "nodejs";

/**
 * Voice-agent tool `book_consultation`.
 * Body: { start, name, phone?, email?, summary?, call_id? }
 */
export async function POST(req: NextRequest) {
  const denied = toolAuthError(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  if (!b.start || !b.name) {
    return NextResponse.json({ ok: false, message: "Need the caller's name and the chosen slot." }, { status: 400 });
  }
  try {
    const booking = await bookConsultation(b);
    await q(
      `INSERT INTO bookings (booking_id, caller_phone, caller_name, slot_start, summary, call_ref)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (booking_id) DO NOTHING`,
      [booking.id, b.phone ?? null, b.name, booking.start, b.summary ?? null, b.call_id ?? null]
    );
    // If the call record already exists (rare: tool called after processing), link it now.
    if (b.call_id) {
      await q("UPDATE calls SET booked_at = $1, booking_id = $2 WHERE external_id = $3", [booking.start, booking.id, String(b.call_id)]);
    }
    const say = new Date(booking.start).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
    });
    return NextResponse.json({ ok: true, booking_id: booking.id, message: `Booked for ${say}.` });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      message: "That slot couldn't be booked. Offer another slot, or say a designer will call back within one working day.",
    });
  }
}
