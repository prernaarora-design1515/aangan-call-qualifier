"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface OutboundRow {
  id: number;
  phone: string;
  name: string | null;
  status: string;
  error: string | null;
  demo: boolean;
  created_at: string;
}

const FRAMES = ["[=     ]", "[==    ]", "[ ===  ]", "[  === ]", "[   ===]", "[    ==]", "[     =]", "[      ]"];
const mask = (p: string) => p.replace(/^(\+\d{2})(\d{3})\d{4}(\d{3})$/, "$1 $2•••• $3");
const ago = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const LABEL: Record<string, string> = { dialing: "dialing", completed: "talked", no_answer: "no answer", failed: "failed" };

/** "Call a lead": type a number, Aanya (the Vaani agent) rings it. */
export function Dialer({ recent }: { recent: OutboundRow[] }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "dialing" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  const [f, setF] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 60); }, [open]);
  useEffect(() => {
    if (state !== "dialing") return;
    const id = setInterval(() => setF((n) => (n + 1) % FRAMES.length), 90);
    return () => clearInterval(id);
  }, [state]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const digits = phone.replace(/\D/g, "");
  const valid = digits.length >= 10 && digits.length <= 15;

  async function ring(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || state === "dialing") return;
    setState("dialing"); setMsg("");
    try {
      const res = await fetch("/api/outbound", {
        method: "POST",
        headers: { "content-type": "application/json", "x-aangan-dialer": "1" },
        body: JSON.stringify({ phone, name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
      setState("ok");
      setMsg(`Aanya is ringing ${mask(j.row.phone)} — the call will appear below once it ends.`);
      setPhone(""); setName("");
      router.refresh();
    } catch (err: any) {
      setState("err");
      setMsg(err.message);
      router.refresh();
    }
  }

  return (
    <div className={`dialer ${open ? "is-open" : ""}`}>
      <button type="button" className="dial-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="dialer-panel">
        <span className="dial-ico" aria-hidden>☎</span> {open ? "Close" : "Call a lead"} <span aria-hidden>{open ? "×" : "→"}</span>
      </button>

      <div id="dialer-panel" className="dial-panel" hidden={!open}>
        <form onSubmit={ring} className="dial-form">
          <label>
            <span>Number</span>
            <input ref={input} inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone}
              onChange={(e) => { setPhone(e.target.value); if (state !== "dialing") setState("idle"); }} />
          </label>
          <label>
            <span>Name <i>(optional)</i></span>
            <input placeholder="Who are we calling?" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="ring" disabled={!valid || state === "dialing"}>
            {state === "dialing" ? <code>{FRAMES[f]}</code> : "Ring now"}
          </button>
        </form>
        <p className={`dial-msg ${state}`} role="status" aria-live="polite">
          {state === "idle" && "Aanya, the AI receptionist, calls the number, qualifies the lead and logs it here like any other call."}
          {state === "dialing" && "Dialing through Vaani…"}
          {(state === "ok" || state === "err") && msg}
        </p>

        <div className="dial-recent">
          <div className="dial-head">// recent outbound</div>
          {recent.length === 0 && <div className="dim-on">No outbound calls yet.</div>}
          {recent.map((r) => (
            <div className="dial-row" key={r.id} title={r.error ?? ""}>
              <span className={`dot ${r.status}`} aria-hidden />
              <span className="who">{r.name ?? "—"}</span>
              <span className="num">{mask(r.phone)}</span>
              <span className={`st ${r.status}`}>{LABEL[r.status] ?? r.status}</span>
              <span className="when" suppressHydrationWarning>{ago(r.created_at)}{r.demo ? " · demo" : ""}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
