export type LeadStatus = "good" | "unsure" | "bad" | "escalation";
export type Verdict = "pass" | "fail" | "unclear";

export const CRITERIA = [
  "real_project",
  "service_area",
  "timeline",
  "budget",
  "decision_maker",
] as const;
export type Criterion = (typeof CRITERIA)[number];

export const CRITERION_LABELS: Record<Criterion, string> = {
  real_project: "Real project",
  service_area: "Service area",
  timeline: "Timeline",
  budget: "Budget band",
  decision_maker: "Decision-maker",
};

/** What the LLM returns: evidence per criterion. The status is decided in code (lib/rubric.ts). */
export interface Assessment {
  intent: "new_enquiry" | "existing_client" | "other";
  caller_name: string | null;
  project_type: "residential" | "commercial" | "unknown";
  scope_summary: string;
  location: string | null;
  carpet_area_sqft: number | null;
  timeline: string | null;
  budget_mentioned: string | null;
  out_of_scope: boolean;
  criteria: Record<Criterion, { verdict: Verdict; evidence: string }>;
  open_questions: string[];
  pricing_asked: boolean;
  caller_frustrated: boolean;
  handoff_note: string;
}

export interface CallInput {
  externalId: string;
  callerPhone: string | null;
  startedAt: Date;
  durationSec: number | null;
  transcript: string;
  source: "vaani" | "seed" | "simulate";
  voiceCostInr?: number | null;
}

export interface CallRow {
  id: number;
  external_id: string;
  source: string;
  caller_name: string | null;
  caller_phone: string | null;
  started_at: string;
  duration_sec: number | null;
  after_hours: boolean;
  transcript: string;
  status: LeadStatus;
  intent: string;
  project_type: string;
  scope_summary: string;
  location: string | null;
  carpet_area_sqft: number | null;
  timeline: string | null;
  budget_mentioned: string | null;
  criteria: Assessment["criteria"];
  reasons: string[];
  open_questions: string[];
  pricing_asked: boolean;
  caller_frustrated: boolean;
  handoff_note: string;
  booked_at: string | null;
  hubspot_contact_id: string | null;
  email_sent_at: string | null;
  voice_cost_inr: number;
  ai_cost_inr: number;
  email_cost_inr: number;
  ai_input_tokens: number;
  ai_output_tokens: number;
  created_at: string;
}
