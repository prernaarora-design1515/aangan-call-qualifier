import fs from "node:fs";
import { execSync } from "node:child_process";

/** On Vercel: apply the schema and (re)load the September baseline before building. Skips if no DB yet. */
if (!process.env.DATABASE_URL) {
  console.log("prebuild: DATABASE_URL not set — skipping migrate/seed");
} else {
  execSync("tsx scripts/migrate.ts", { stdio: "inherit" });
  if (fs.existsSync("db/seed-calls.json")) execSync("tsx scripts/seed.ts --reset", { stdio: "inherit" });
}
