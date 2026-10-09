import { Assessment, CRITERIA, CRITERION_LABELS, LeadStatus } from "./types";

/**
 * Applies Nikhil's rubric (knowledge/qualified.md) to the AI's per-criterion evidence.
 * The AI judges each criterion; the decision itself is deterministic so it is auditable.
 *
 *  - existing client with an issue  -> escalation (founder is emailed)
 *  - not an enquiry at all          -> bad
 *  - any criterion fails / out of scope -> bad (closed gracefully, not forwarded)
 *  - any criterion unclear          -> unsure (forwarded, uncertainty noted)
 *  - all pass                       -> good (forwarded)
 */
export function decideStatus(a: Assessment): { status: LeadStatus; reasons: string[] } {
  if (a.intent === "existing_client") {
    return { status: "escalation", reasons: ["Existing client issue — needs a senior call back"] };
  }
  if (a.intent === "other") {
    return { status: "bad", reasons: ["Not a project enquiry"] };
  }

  const reasons: string[] = [];
  const fails = CRITERIA.filter((c) => a.criteria[c]?.verdict === "fail");
  const unclear = CRITERIA.filter((c) => a.criteria[c]?.verdict === "unclear");

  if (a.out_of_scope) reasons.push("Outside the studio's scope (services.md)");
  for (const c of fails) reasons.push(`${CRITERION_LABELS[c]}: ${a.criteria[c].evidence}`);
  if (a.out_of_scope || fails.length > 0) return { status: "bad", reasons };

  for (const c of unclear) reasons.push(`${CRITERION_LABELS[c]} unclear: ${a.criteria[c].evidence}`);
  if (unclear.length > 0) return { status: "unsure", reasons };

  return { status: "good", reasons: ["Passes all five criteria"] };
}

export const FORWARD_TO_DESIGNER: LeadStatus[] = ["good", "unsure"];
