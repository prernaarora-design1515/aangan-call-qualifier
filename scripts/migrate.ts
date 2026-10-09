import fs from "node:fs";
import { pool } from "../lib/db";

(async () => {
  await pool.query(fs.readFileSync("db/schema.sql", "utf8"));
  console.log("Schema applied.");
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
