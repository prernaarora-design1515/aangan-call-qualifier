import { LeadStatus } from "@/lib/types";

export const STATUS: Record<LeadStatus, { label: string; color: string; hint: string }> = {
  good: { label: "Good", color: "var(--good)", hint: "Forwarded to designer" },
  unsure: { label: "Unsure", color: "var(--warning)", hint: "Forwarded, with open questions" },
  bad: { label: "Not a fit", color: "var(--neutral)", hint: "Closed politely, logged in HubSpot" },
  escalation: { label: "Escalation", color: "var(--critical)", hint: "Existing client — founder emailed" },
};

const ICON: Record<LeadStatus, string> = { good: "✓", unsure: "?", bad: "–", escalation: "!" };

export function StatusPill({ status }: { status: LeadStatus }) {
  const s = STATUS[status];
  return (
    <span className="pill" title={s.hint}>
      <i style={{ background: s.color }} aria-hidden />
      <span aria-hidden>{ICON[status]}</span> {s.label}
    </span>
  );
}
