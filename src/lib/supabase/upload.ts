import { createClient } from "@/lib/supabase/client";

/**
 * Upload a file straight from the browser to Supabase Storage (authenticated
 * user session, guarded by bucket RLS). Returns the stored path. This bypasses
 * the server-action body-size limit (Vercel caps it at ~4.5MB).
 */
export async function uploadFile(
  bucket: string,
  file: File
): Promise<{ path?: string; error?: string }> {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) return { error: error.message };
  return { path };
}
