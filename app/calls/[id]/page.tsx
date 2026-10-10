import Link from "next/link";
import { notFound } from "next/navigation";
import { q } from "@/lib/db";
import { inr } from "@/lib/metrics";
import { CallRow, CRITERIA, CRITERION_LABELS } from "@/lib/types";
import { StatusPill } from "../../status";
import { Scramble } from "../../fx";

export const dynamic = "force-dynamic";

const fmt = (d: string) =>
  new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

const VERDICT_COLOR = { pass: "var(--good)", fail: "var(--critical)", unclear: "var(--warning)" } as const;

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [c] = await q<CallRow & { errors: string[]; voice_cost_actual: boolean }>("SELECT * FROM calls WHERE id = $1", [Number(id)]);
  if (!c) notFound();
  const month = new Date(c.started_at).toLocaleString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
  const total = Number(c.voice_cost_inr) + Number(c.ai_cost_inr) + Number(c.email_cost_inr);

  return (
    <main className="wrap">
      <Link className="back" href={`/?month=${month}`}>— All calls</Link>
      <header className="hero compact">
        <div className="brand">// Call #{c.id}{c.source === "seed" ? " · September baseline" : ""}</div>
        <h1><Scramble text={c.caller_name ?? "Unknown caller"} onMount /> <StatusPill status={c.status} /></h1>
        <p className="meta">
          {fmt(c.started_at)} · {Math.round((c.duration_sec ?? 0) / 60 * 10) / 10} min
          {c.after_hours ? " · after hours" : ""}{c.caller_phone ? ` · ${c.caller_phone}` : ""}
        </p>
      </header>

      {c.errors?.length > 0 && (
        <div className="banner">Integration errors: {c.errors.join(" · ")}</div>
      )}

      <section className="grid two">
        <div className="card">
          <h2>Handoff <Scramble className="hl lime" text="note" /></h2>
          <p className="note" style={{ marginTop: 0 }}>{c.handoff_note}</p>
          {c.open_questions.length > 0 && (
            <>
              <h2 style={{ marginTop: 22 }}>Still <Scramble className="hl pink" text="to ask" /></h2>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{c.open_questions.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          )}
          <p className="dim" style={{ marginTop: 16, marginBottom: 0 }}>
            {c.booked_at ? `Consultation booked for ${fmt(c.booked_at)}. ` : "No consultation booked. "}
            {c.email_sent_at ? `Email sent ${fmt(c.email_sent_at)}. ` : ""}
            {c.hubspot_contact_id ? `HubSpot contact ${c.hubspot_contact_id}.` : ""}
          </p>
        </div>

        <div className="card">
          <h2>The <Scramble className="hl lilac" text="rubric" /></h2>
          {CRITERIA.map((k) => {
            const v = c.criteria[k];
            return (
              <div className="crit" key={k}>
                <span>{CRITERION_LABELS[k]}</span>
                <span className="pill" style={{ justifySelf: "start" }}>
                  <i style={{ background: VERDICT_COLOR[v?.verdict ?? "unclear"] }} aria-hidden />{v?.verdict ?? "—"}
                </span>
                <span className="dim" style={{ fontSize: 13 }}>{v?.evidence}</span>
              </div>
            );
          })}
          <p className="dim" style={{ marginBottom: 0 }}>Decision: {c.reasons.join("; ")}</p>
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <h2><Scramble className="hl" text="Transcript" /></h2>
          <div className="transcript">{c.transcript}</div>
        </div>
        <div className="card dark">
          <h2>The <Scramble className="hl lime" text="details" /></h2>
          <table>
            <tbody>
              <tr><td>Project</td><td>{c.project_type}{c.carpet_area_sqft ? ` · ${c.carpet_area_sqft.toLocaleString("en-IN")} sq ft` : ""}</td></tr>
              <tr><td>Location</td><td>{c.location ?? "—"}</td></tr>
              <tr><td>Timeline</td><td>{c.timeline ?? "—"}</td></tr>
              <tr><td>Budget mentioned</td><td>{c.budget_mentioned ?? "No"}</td></tr>
              <tr><td>Asked about price</td><td>{c.pricing_asked ? "Yes — deflected" : "No"}</td></tr>
              <tr><td>Voice cost</td><td className="num">{inr(Number(c.voice_cost_inr), 2)}{c.voice_cost_actual ? "" : " (est.)"}</td></tr>
              <tr><td>AI cost</td><td className="num">{inr(Number(c.ai_cost_inr), 3)} <span className="dim">{c.ai_input_tokens + c.ai_output_tokens} tokens</span></td></tr>
              <tr className="total"><td>Call total</td><td className="num">{inr(total, 2)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
