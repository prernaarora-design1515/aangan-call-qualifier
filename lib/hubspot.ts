import { CallRow } from "./types";

const BASE = process.env.HUBSPOT_BASE_URL || "https://api.hubapi.com";
const STATUS_LABEL = { good: "Good", unsure: "Unsure", bad: "Bad", escalation: "Escalation" } as const;

async function hs(path: string, body: unknown, method = "POST") {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HubSpot ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function findContactByPhone(phone: string): Promise<string | null> {
  const r = await hs("/crm/v3/objects/contacts/search", {
    filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: phone }] }],
    limit: 1,
  });
  return r.results?.[0]?.id ?? null;
}

/**
 * Logs every call: contact (found by phone or created) + a note with the AI assessment.
 * Good leads also become a deal in the default pipeline — "qualified calls become deals".
 */
export async function syncToHubSpot(call: CallRow): Promise<{ contactId: string; dealId: string | null }> {
  const [first, ...rest] = (call.caller_name ?? "Phone caller").split(" ");
  const phoneUsable = call.caller_phone && !/[x*]/i.test(call.caller_phone); // Vaani may mask numbers

  let contactId = phoneUsable ? await findContactByPhone(call.caller_phone!) : null;
  if (!contactId) {
    const c = await hs("/crm/v3/objects/contacts", {
      properties: {
        firstname: first,
        lastname: rest.join(" ") || undefined,
        phone: phoneUsable ? call.caller_phone : undefined,
        city: call.location ?? undefined,
        lifecyclestage: call.status === "good" ? "salesqualifiedlead" : "lead",
        hs_lead_status: call.status === "bad" ? "UNQUALIFIED" : "NEW",
      },
    });
    contactId = c.id as string;
  }

  const noteBody = [
    `<b>AI call qualifier — ${STATUS_LABEL[call.status]}</b>`,
    `Call: ${new Date(call.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · ${Math.round((call.duration_sec ?? 0) / 60)} min${call.after_hours ? " · after hours" : ""}`,
    `Scope: ${call.scope_summary}`,
    `Reasons: ${call.reasons.join("; ")}`,
    call.open_questions.length ? `Open questions: ${call.open_questions.join("; ")}` : "",
    `<br>${call.handoff_note.replace(/\n/g, "<br>")}`,
  ].filter(Boolean).join("<br>");

  await hs("/crm/v3/objects/notes", {
    properties: { hs_timestamp: new Date(call.started_at).toISOString(), hs_note_body: noteBody },
    associations: [
      { to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] },
    ],
  });

  let dealId: string | null = null;
  if (call.status === "good") {
    const d = await hs("/crm/v3/objects/deals", {
      properties: {
        dealname: `${call.caller_name ?? "Caller"} — ${call.scope_summary}`.slice(0, 200),
        pipeline: "default",
        dealstage: call.booked_at ? "appointmentscheduled" : "qualifiedtobuy",
      },
      associations: [
        { to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] },
      ],
    });
    dealId = d.id as string;
  }
  return { contactId, dealId };
}
