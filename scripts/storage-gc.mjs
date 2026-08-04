// Storage garbage collector: find files in tenant-media not referenced by any
// tenant/contract row, and (with --delete) remove them.
//
//   node scripts/storage-gc.mjs            # dry run (list orphans)
//   node scripts/storage-gc.mjs --delete   # actually delete them
//
// Signs in as the owner (owner delete policy) using GC_EMAIL / GC_PASSWORD
// (defaults to the local seed owner). Reads referenced paths via SUPABASE_DB_URL.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function env(name) {
  if (process.env[name]) return process.env[name].trim();
  try {
    const m = readFileSync(join(root, ".env.local"), "utf8").match(
      new RegExp(`^\\s*${name}\\s*=\\s*(.+)\\s*$`, "m")
    );
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch {}
  return null;
}

const BUCKET = "tenant-media";
const url = env("NEXT_PUBLIC_SUPABASE_URL");
const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const dbUrl = env("SUPABASE_DB_URL");
const doDelete = process.argv.includes("--delete");

const sb = createClient(url, anon);
await sb.auth.signInWithPassword({
  email: env("GC_EMAIL") || "owner@skm.local",
  password: env("GC_PASSWORD") || "password123",
});

async function listAll(prefix = "") {
  const { data } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 });
  let files = [];
  for (const e of data ?? []) {
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.id === null) files = files.concat(await listAll(path));
    else files.push(path);
  }
  return files;
}
const allFiles = await listAll();

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
const referenced = new Set();
for (const q of [
  "select photo_url, national_id_image_url, co_tenant_national_id_image_url from public.tenants",
  "select contract_scan_url from public.contracts",
]) {
  const { rows } = await client.query(q);
  for (const row of rows)
    for (const v of Object.values(row)) if (v) referenced.add(v);
}
await client.end();

const orphans = allFiles.filter((f) => !referenced.has(f));
console.log(`files=${allFiles.length} referenced=${referenced.size} orphans=${orphans.length}`);
orphans.forEach((o) => console.log("  " + o));

if (doDelete && orphans.length) {
  const { error } = await sb.storage.from(BUCKET).remove(orphans);
  console.log(error ? `delete ERR: ${error.message}` : `deleted ${orphans.length} file(s)`);
} else if (orphans.length) {
  console.log("\n(dry run — re-run with --delete to remove them)");
}
