import { Assessment, CRITERIA } from "./types";
import { studioContext } from "./knowledge";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const verdict = {
  type: "OBJECT",
  properties: {
    verdict: { type: "STRING", enum: ["pass", "fail", "unclear"] },
    evidence: { type: "STRING" },
  },
  required: ["verdict", "evidence"],
};

const schema = {
  type: "OBJECT",
  properties: {
    intent: { type: "STRING", enum: ["new_enquiry", "existing_client", "other"] },
    caller_name: { type: "STRING", nullable: true },
    project_type: { type: "STRING", enum: ["residential", "commercial", "unknown"] },
    scope_summary: { type: "STRING" },
    location: { type: "STRING", nullable: true },
    carpet_area_sqft: { type: "NUMBER", nullable: true },
    timeline: { type: "STRING", nullable: true },
    budget_mentioned: { type: "STRING", nullable: true },
    out_of_scope: { type: "BOOLEAN" },
    criteria: {
      type: "OBJECT",
      properties: Object.fromEntries(CRITERIA.map((c) => [c, verdict])),
      required: [...CRITERIA],
    },
    open_questions: { type: "ARRAY", items: { type: "STRING" } },
    pricing_asked: { type: "BOOLEAN" },
    caller_frustrated: { type: "BOOLEAN" },
    handoff_note: { type: "STRING" },
  },
  required: [
    "intent", "caller_name", "project_type", "scope_summary", "location", "carpet_area_sqft",
    "timeline", "budget_mentioned", "out_of_scope", "criteria", "open_questions",
    "pricing_asked", "caller_frustrated", "handoff_note",
  ],
};

function instructions(callDate: string): string {
  return `You review phone-call transcripts for Aangan Studio, an interior design studio in Pune.
Today's date (the call date) is ${callDate}. Use only the studio documents below and the transcript.

${studioContext()}

Judge each of the five criteria in qualified.md with a verdict and a one-line evidence quote/paraphrase:
- real_project: pass if they want design + execution of at least a room; fail for advice-only, decor-only,
  standalone furniture, Vastu-only, or "just exploring"; unclear if not established.
- service_area: pass if the site is in Pune city or PCMC; fail if outside (e.g. Nashik, Talegaon, Mumbai).
- timeline: pass if execution can realistically start within 8-10 weeks and the deadline leaves at least
  6 weeks for execution; fail if they need it done in under ~6 weeks; unclear if never discussed.
- budget: pass if no budget was mentioned (do NOT treat silence as unclear). Fail only if they volunteered a
  number clearly below what their scope costs (e.g. Rs 1-1.5 lakh for a kitchen + bedroom or a full flat).
- decision_maker: pass if the caller decides or is authorised; unclear if researching for someone else
  who has not authorised them; fail only if clearly not involved.
Set out_of_scope=true for restaurants, hotels, retail, gyms, structural/architecture work, or commercial
spaces far below a viable size (well under ~500 sq ft).
intent: "existing_client" for someone with an ongoing Aangan project (e.g. a complaint), "other" for
non-enquiries (vendors, job seekers, wrong numbers), else "new_enquiry".
handoff_note: 3-6 short lines a designer reads before calling back — who, where, what scope, size, state of
site, timeline, how they found Aangan, and anything to handle with care. Never include any price figure.
open_questions: what the designer should still ask. Do not invent facts that are not in the transcript.`;
}

export interface AiResult {
  assessment: Assessment;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/** Light PII scrub: masks phone numbers and emails before the transcript leaves our backend. */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/(\+?\d[\d\s-]{8,}\d)/g, "[phone]");
}

export async function assessCall(transcript: string, callDate: Date): Promise<AiResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(
    `${process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com"}/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions(callDate.toDateString()) }] },
        contents: [{ role: "user", parts: [{ text: "TRANSCRIPT:\n" + redact(transcript) }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const text: string = body.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  const assessment = JSON.parse(text) as Assessment;
  return {
    assessment,
    inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0),
    model: MODEL,
  };
}
