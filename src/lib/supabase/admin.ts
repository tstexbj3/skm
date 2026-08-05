import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. SERVER-ONLY — it bypasses Row-Level Security,
 * so it must NEVER be imported into client code or shipped to the browser.
 *
 * Used only by trusted server-to-server endpoints (the LINE webhook) that have
 * no signed-in user and therefore cannot authorize through RLS. The key lives
 * in the server-only env var SUPABASE_SERVICE_ROLE_KEY.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
