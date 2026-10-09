import fs from "node:fs";
import path from "node:path";

const cache: Record<string, string> = {};

function load(name: string): string {
  if (!cache[name]) {
    cache[name] = fs.readFileSync(path.join(process.cwd(), "knowledge", name), "utf8");
  }
  return cache[name];
}

/** The three studio documents used as grounding context for the classifier. */
export function studioContext(): string {
  return [
    "<services.md>\n" + load("services.md") + "\n</services.md>",
    "<qualified.md>\n" + load("qualified.md") + "\n</qualified.md>",
  ].join("\n\n");
  // pricing.md is deliberately NOT sent to the classifier: it is internal-only and the
  // handoff note must never carry a price. The voice agent uses it only to know what not to say.
}
