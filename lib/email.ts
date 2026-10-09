import { CallRow, CRITERIA, CRITERION_LABELS } from "./types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmt = (d: string) =>
  new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

async function send(to: string[], subject: string, html: string) {
  const res = await fetch(`${process.env.RESEND_BASE_URL || "https://api.resend.com"}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Designer handoff for Good / Unsure leads — everything the front desk would have asked. */
export async function sendDesignerHandoff(call: CallRow) {
  const tag = call.status === "good" ? "Qualified lead" : "Lead to check";
  const subject = `[${tag}] ${call.caller_name ?? "New caller"} — ${call.scope_summary}`.slice(0, 140);
  const rows = CRITERIA.map(
    (c) =>
      `<tr><td style="padding:4px 10px 4px 0;color:#555">${CRITERION_LABELS[c]}</td>` +
      `<td style="padding:4px 0"><b>${call.criteria[c]?.verdict ?? "-"}</b> — ${esc(call.criteria[c]?.evidence ?? "")}</td></tr>`
  ).join("");

  const html = `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:640px">
    <h2 style="margin:0 0 6px">${tag}: ${esc(call.caller_name ?? "New caller")}</h2>
    <p style="margin:0 0 14px;color:#555">Called ${fmt(call.started_at)}${call.after_hours ? " (after hours)" : ""}
      · ${Math.round((call.duration_sec ?? 0) / 60)} min${call.caller_phone ? " · " + esc(call.caller_phone) : ""}</p>
    ${call.booked_at ? `<p style="background:#eaf5ec;padding:8px 12px;border-radius:6px"><b>Consultation booked:</b> ${fmt(call.booked_at)}</p>` : `<p style="background:#fdf6e3;padding:8px 12px;border-radius:6px"><b>No consultation booked</b> — please call back within one working day.</p>`}
    <h3 style="margin:18px 0 6px">Handoff note</h3>
    <p style="white-space:pre-line;margin:0">${esc(call.handoff_note)}</p>
    <h3 style="margin:18px 0 6px">Rubric</h3>
    <table style="border-collapse:collapse;font-size:13px">${rows}</table>
    ${call.open_questions.length ? `<h3 style="margin:18px 0 6px">Still to ask</h3><ul>${call.open_questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}
    ${call.caller_frustrated ? `<p style="color:#b42318"><b>Handle with care:</b> caller sounded frustrated.</p>` : ""}
    ${call.pricing_asked ? `<p style="color:#555">Caller asked about pricing — they were told the designer will cover it at the consultation.</p>` : ""}
    <p style="color:#888;font-size:12px;margin-top:20px">Sent by the Aangan AI call qualifier. Full transcript is in HubSpot and the dashboard.</p>
  </div>`;
  await send(list(process.env.DESIGNER_EMAILS), subject, html);
}

/** Existing-client complaints go straight to the founder / studio head. */
export async function sendEscalation(call: CallRow) {
  const html = `
  <div style="font-family:Arial,sans-serif;font-size:14px;max-width:640px">
    <h2 style="color:#b42318;margin:0 0 6px">Existing client needs a call back</h2>
    <p style="color:#555">${fmt(call.started_at)}${call.caller_phone ? " · " + esc(call.caller_phone) : ""}</p>
    <p style="white-space:pre-line">${esc(call.handoff_note)}</p>
    <p>The caller was promised a call back from a senior person within 15 minutes.</p>
  </div>`;
  await send(list(process.env.FOUNDER_EMAIL), `[Escalation] ${call.caller_name ?? "Existing client"} — call back now`, html);
}
