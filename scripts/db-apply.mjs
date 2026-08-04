// Apply all supabase/migrations/*.sql to the database in SUPABASE_DB_URL.
// Idempotent: migrations use IF NOT EXISTS, and "already exists" errors are
// treated as skips. Reads the URL from the environment or from .env.local.
//
//   node scripts/db-apply.mjs
//
// SUPABASE_DB_URL example (Supabase → Settings → Database → Connection string):
//   postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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

const url = loadDbUrl();
if (!url || url.includes("YOUR-PASSWORD") || url.includes("PASSWORD@")) {
  console.error(
    "Set SUPABASE_DB_URL in .env.local (with your real DB password) first."
  );
  process.exit(1);
}

const dir = join(root, "supabase", "migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`Connected. Applying ${files.length} migration file(s):\n`);
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    process.stdout.write(`  ${f} ... `);
    try {
      await client.query(sql);
      console.log("OK");
    } catch (e) {
      const msg = String(e.message || e);
      if (/already exists|duplicate/i.test(msg)) console.log("skip (already applied)");
      else console.log("ERR: " + msg);
    }
  }
  console.log("\nReloading PostgREST schema cache ...");
  try {
    await client.query("notify pgrst, 'reload schema'");
    console.log("done.");
  } catch (e) {
    console.log("(reload skipped: " + e.message + ")");
  }
} catch (e) {
  console.error("Connection failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
