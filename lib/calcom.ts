/** Cal.com API v2 — free consultation booking from inside the call. */
const BASE = "https://api.cal.com/v2";

function headers(version: string) {
  return {
    Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
    "cal-api-version": version,
    "Content-Type": "application/json",
  };
}

export async function getSlots(days = 7): Promise<string[]> {
  const start = new Date();
  const end = new Date(start.getTime() + days * 86400_000);
  const url =
    `${BASE}/slots?eventTypeId=${process.env.CALCOM_EVENT_TYPE_ID}` +
    `&start=${start.toISOString().slice(0, 10)}&end=${end.toISOString().slice(0, 10)}&timeZone=Asia/Kolkata`;
  const res = await fetch(url, { headers: headers("2024-09-04") });
  if (!res.ok) throw new Error(`Cal.com slots ${res.status}: ${await res.text()}`);
  const body = await res.json();
  // data: { "2026-10-12": [{ start: "..." }, ...], ... }
  return Object.values(body.data ?? {})
    .flat()
    .map((s: any) => s.start as string)
    .slice(0, 12);
}

export async function bookConsultation(input: {
  start: string;
  name: string;
  phone?: string;
  email?: string;
  summary?: string;
}): Promise<{ id: string; start: string }> {
  const res = await fetch(`${BASE}/bookings`, {
    method: "POST",
    headers: headers("2024-08-13"),
    body: JSON.stringify({
      start: new Date(input.start).toISOString(),
      eventTypeId: Number(process.env.CALCOM_EVENT_TYPE_ID),
      attendee: {
        name: input.name,
        // Phone callers often have no email to hand; the studio inbox stands in so Cal.com accepts it.
        email: input.email || process.env.CALCOM_FALLBACK_EMAIL,
        timeZone: "Asia/Kolkata",
        phoneNumber: input.phone,
      },
      metadata: { source: "ai-call-qualifier", summary: (input.summary ?? "").slice(0, 400) },
    }),
  });
  if (!res.ok) throw new Error(`Cal.com booking ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return { id: String(body.data?.uid ?? body.data?.id), start: body.data?.start ?? input.start };
}
