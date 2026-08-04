import { createClient } from "@/lib/supabase/server";

/**
 * Create a short-lived signed URL for a private-bucket object path.
 * Returns null for missing paths or on error (so callers can render a fallback).
 */
export async function signedUrl(
  bucket: string,
  path: string | null | undefined,
  expiresInSeconds = 3600
): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  return error ? null : data.signedUrl;
}
