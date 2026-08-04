// Run a single .sql file against SUPABASE_DB_URL.
//   node scripts/db-sql.mjs supabase/storage.cloud.sql
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL.trim();
  try {
    const env = readFileSync(join(root, ".env.local"), "utf8");
    const m = env.match(/^\s*SUPABASE_DB_URL\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch {}
  return null;
}

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/db-sql.mjs <path-to.sql>");
  process.exit(1);
}
const url = loadDbUrl();
if (!url || url.includes("YOUR-PASSWORD")) {
  console.error("Set SUPABASE_DB_URL in .env.local first.");
  process.exit(1);
}

const sql = readFileSync(resolve(root, file), "utf8");
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
try {
  await client.connect();
  await client.query(sql);
  console.log(`Applied ${file}`);
  await client.query("notify pgrst, 'reload schema'");
} catch (e) {
  console.error("ERR:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
