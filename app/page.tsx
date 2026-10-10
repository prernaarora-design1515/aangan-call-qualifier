import Link from "next/link";
import { after } from "next/server";
import { syncFromVaani } from "@/lib/vaani-sync";
import { availableMonths, inr, monthStats } from "@/lib/metrics";
import { CRITERION_LABELS, LeadStatus } from "@/lib/types";
import { STATUS, StatusPill } from "./status";
import { AsciiWave, CountUp, Scramble, Spinner } from "./fx";
import { Dialer, OutboundRow } from "./dialer";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

const ORDER: LeadStatus[] = ["good", "unsure", "bad", "escalation"];
const AVG_PROJECT_LAKH = [8, 14]; // from the case: average project value ₹8–14 lakh

function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

const fmtTime = (d: string) =>
  new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  // Opening the dashboard also pulls any finished Vaani calls (backstop for the 5-minute sync)
  if (process.env.VAANI_API_KEY) after(() => syncFromVaani().catch((e) => console.error("vaani sync", e)));
  const months = await availableMonths();
  const { month: qMonth } = await searchParams;
  const month = qMonth && /^\d{4}-\d{2}$/.test(qMonth) ? qMonth : months[0] ?? new Date().toISOString().slice(0, 7);
  const s = await monthStats(month);
  const pct = (a: number) => (s.total ? Math.round((a / s.total) * 100) : 0);
  const maxDay = Math.max(1, ...s.perDay.map((d) => d.count));
  const maxDecline = Math.max(1, ...s.declineReasons.map((d) => d.count));
  const perCall = s.total ? s.cost.total / s.total : 0;
  const perForwarded = s.forwarded ? s.cost.total / s.forwarded : 0;
  const hasSeed = s.calls.some((c) => c.source === "seed");
  const hasDemo = s.calls.some((c) => c.source === "demo");
  const outbound = await q<OutboundRow>("SELECT id, phone, name, status, error, demo, created_at FROM outbound_calls ORDER BY created_at DESC LIMIT 6").catch(() => []);

  return (
    <main className="wrap">
      <header className="hero">
        <div className="brand">// Aangan Studio · Call desk</div>
        <h1>Every call <Scramble className="hl" text="answered." onMount /><br />Every lead <Scramble className="hl lilac" text="qualified." onMount /></h1>
        <div className="hero-row">
          <p className="sub">Answered, checked against Nikhil&apos;s five criteria and handed to a designer — {monthLabel(month)}.</p>
          <span className="tag">AI call qualifier →</span>
        </div>
        <Dialer recent={outbound} />
        <AsciiWave label={`${s.total} calls on the line`} />
        <nav className="months" aria-label="Month">
          {months.map((m) => (
            <Link key={m} href={`/?month=${m}`} className={m === month ? "on" : ""}>{monthLabel(m)}</Link>
          ))}
        </nav>
      </header>

      <div className="ticker" aria-hidden>
        <div className="ticker-track">
          {[0, 1].map((k) => (
            <span key={k}>
              ▓ {s.total} calls answered ░ {s.afterHours} after hours ░ {s.forwarded} sent to designers ░ {s.byStatus.good} good leads ░{" "}
              {s.byStatus.escalation} escalations ░ {s.pricingAsked} price questions deflected ░ {inr(s.cost.total)} to run ░ 0 prices quoted ░&nbsp;
            </span>
          ))}
        </div>
      </div>

      {hasDemo && (
        <div className="banner demo">
          This month shows demo calls (tagged DEMO) so the dashboard isn&apos;t empty — real Vaani calls appear alongside them and replace them over time.
        </div>
      )}

      {hasSeed && (
        <div className="banner">
          Includes September 2026 phone enquiries (front-desk transcripts) replayed through the qualifier as a
          baseline. Voice costs for these are estimates at {inr(Number(process.env.VAANI_INR_PER_MIN ?? 6))}/min.
        </div>
      )}

      <section className="grid kpis">
        <div className="card stat">
          <div className="l">Calls answered</div>
          <div className="v"><CountUp to={s.total} /></div>
          <div className="s">100% picked up · avg {Math.round(s.avgDurationSec / 60 * 10) / 10} min</div>
        </div>
        <div className="card stat">
          <div className="l">Outside 10am–7pm</div>
          <div className="v"><CountUp to={s.afterHours} /></div>
          <div className="s">{pct(s.afterHours)}% of calls — outside front-desk hours</div>
        </div>
        <div className="card stat">
          <div className="l">Sent to designers</div>
          <div className="v"><CountUp to={s.forwarded} /></div>
          <div className="s">{s.byStatus.good} good · {s.byStatus.unsure} unsure{s.handoffMinutes != null ? ` · email in ${Math.max(1, Math.round(s.handoffMinutes))} min` : ""}</div>
        </div>
        <div className="card stat">
          <div className="l">Consultations booked</div>
          <div className="v"><CountUp to={s.booked} /></div>
          <div className="s">on the call, via Cal.com</div>
        </div>
        <div className="card stat">
          <div className="l">Cost to run</div>
          <div className="v"><CountUp to={Math.round(s.cost.total)} prefix="₹" /></div>
          <div className="s">{inr(perCall, 2)} per call · {inr(perForwarded, 2)} per lead sent</div>
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <h2>Lead <Scramble className="hl lime" text="quality" /></h2>
          <div className="mix" role="img" aria-label={ORDER.map((k) => `${STATUS[k].label} ${s.byStatus[k]}`).join(", ")}>
            {ORDER.filter((k) => s.byStatus[k] > 0).map((k) => (
              <span key={k} title={`${STATUS[k].label}: ${s.byStatus[k]}`} style={{ flex: s.byStatus[k], background: STATUS[k].color }} />
            ))}
          </div>
          <div className="legend">
            {ORDER.map((k) => (
              <div key={k}>
                <span className="sw" style={{ background: STATUS[k].color }} />
                <span>
                  <b>{s.byStatus[k]}</b> {STATUS[k].label} <span className="dim">({pct(s.byStatus[k])}%)</span>
                  <small>{STATUS[k].hint}</small>
                </span>
              </div>
            ))}
          </div>
          {s.byStatus.good > 0 && (
            <p className="dim" style={{ margin: "14px 0 0" }}>
              {s.byStatus.good} good lead{s.byStatus.good === 1 ? "" : "s"} ≈ ₹{s.byStatus.good * AVG_PROJECT_LAKH[0]}–{s.byStatus.good * AVG_PROJECT_LAKH[1]} lakh
              of potential projects at the studio's ₹8–14 lakh average.
            </p>
          )}
        </div>

        <div className="card">
          <h2>Calls <Scramble className="hl pink" text="per day" /></h2>
          <div className="cols" role="img" aria-label="Calls per day">
            {s.perDay.map((d, i) => (
              <div className="col" key={d.day} style={{ ["--i" as string]: i } as React.CSSProperties}>
                {d.count - d.afterHours > 0 && (
                  <span style={{ height: `${((d.count - d.afterHours) / maxDay) * 100}%`, background: "var(--accent)" }} />
                )}
                {d.afterHours > 0 && (
                  <span style={{ height: `${(d.afterHours / maxDay) * 100}%`, background: "var(--accent-soft)" }} />
                )}
                <div className="tip">{d.day} {monthLabel(month).split(" ")[0].slice(0, 3)}: {d.count} call{d.count === 1 ? "" : "s"}{d.afterHours ? ` (${d.afterHours} after hours)` : ""}</div>
              </div>
            ))}
          </div>
          <div className="axis-x"><span>1</span><span>{Math.ceil(s.perDay.length / 2)}</span><span>{s.perDay.length}</span></div>
          <div className="legend" style={{ marginTop: 10 }}>
            <div><span className="sw" style={{ background: "var(--accent)" }} /><span>Office hours</span></div>
            <div><span className="sw" style={{ background: "var(--accent-soft)" }} /><span>After hours</span></div>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <h2>Why calls <Scramble className="hl" text="weren't a fit" /></h2>
          {s.declineReasons.length === 0 && <p className="dim">No declined calls this month.</p>}
          {s.declineReasons.map((d, i) => (
            <div className="hbar" key={d.criterion} style={{ ["--i" as string]: i } as React.CSSProperties}>
              <span>{d.criterion === "out_of_scope" ? "Out of scope" : CRITERION_LABELS[d.criterion]}</span>
              <div className="track"><div className="fill" style={{ width: `${(d.count / maxDecline) * 100}%` }} /></div>
              <span className="n">{d.count}</span>
            </div>
          ))}
          <p className="dim" style={{ margin: "12px 0 0" }}>
            {s.pricingAsked} caller{s.pricingAsked === 1 ? "" : "s"} asked about pricing — deflected to the consultation, never disqualified.
          </p>
        </div>

        <div className="card dark">
          <h2>What it <Scramble className="hl lime" text="cost" /></h2>
          <table>
            <tbody>
              <tr><td>Voice & telephony <span className="dim">Vaani Labs{s.cost.voiceActual ? "" : " · estimate"}</span></td><td className="num">{inr(s.cost.voice, 2)}</td></tr>
              <tr><td>Classification <span className="dim">Gemini Flash</span></td><td className="num">{inr(s.cost.ai, 2)}</td></tr>
              <tr><td>Designer emails <span className="dim">Resend</span></td><td className="num">{inr(s.cost.email, 2)}</td></tr>
              <tr><td>Fixed <span className="dim">HubSpot, Neon, Vercel free tiers{s.cost.fixed ? " + number rental" : ""}</span></td><td className="num">{inr(s.cost.fixed, 2)}</td></tr>
              <tr className="total"><td>Total</td><td className="num">{inr(s.cost.total, 2)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>All <Scramble className="hl lilac" text="calls" /></h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>When</th><th>Caller</th><th>Enquiry</th><th className="hide-sm">Area</th><th>Result</th>
                <th className="hide-sm">Handoff</th>
              </tr>
            </thead>
            <tbody>
              {s.calls.map((c) => (
                <tr key={c.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link className="rowlink" href={`/calls/${c.id}`}>{fmtTime(c.started_at)}</Link>
                    {c.after_hours && <div className="dim">after hours</div>}
                  </td>
                  <td><Link className="rowlink" href={`/calls/${c.id}`}>{c.caller_name ?? <span className="dim">Unknown</span>}{c.source === "demo" && <span className="demo-tag">demo</span>}</Link></td>
                  <td><Link className="rowlink" href={`/calls/${c.id}`}>{c.scope_summary}</Link></td>
                  <td className="hide-sm">{c.location ?? <span className="dim">—</span>}</td>
                  <td><StatusPill status={c.status} /></td>
                  <td className="hide-sm dim">
                    {c.booked_at ? "Booked · " : ""}
                    {c.email_sent_at ? "Emailed" : c.source === "seed" ? "Baseline" : c.status === "bad" ? "HubSpot only" : <><Spinner /> Pending</>}
                  </td>
                </tr>
              ))}
              {s.calls.length === 0 && (
                <tr><td colSpan={6} className="dim">No calls yet this month.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
