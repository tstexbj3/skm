import { createClient } from "@/lib/supabase/client";

/** Longest side of an uploaded photo; documents stay perfectly readable. */
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

/**
 * Downscale/re-encode a photo to JPEG in the browser so phone photos (Android
 * cameras easily produce 10–25MB files) upload quickly and reliably. Returns
 * null when the image can't be decoded or the re-encode isn't smaller — the
 * caller then uploads the original file unchanged.
 */
async function compressImage(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(bitmap.width, bitmap.height)
    );
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    return blob && blob.size < file.size ? blob : null;
  } catch {
    return null;
  }
}

/**
 * Upload a file straight from the browser to Supabase Storage (authenticated
 * user session, guarded by bucket RLS). Returns the stored path. This bypasses
 * the server-action body-size limit (Vercel caps it at ~4.5MB). Photos are
 * downscaled client-side first; other files (PDFs) upload as-is.
 */
export async function uploadFile(
  bucket: string,
  file: File
): Promise<{ path?: string; error?: string }> {
  let body: Blob = file;
  let ext = (file.name.split(".").pop() || "").toLowerCase();
  let contentType = file.type || undefined;

  if (file.type.startsWith("image/")) {
    const compressed = await compressImage(file);
    if (compressed) {
      body = compressed;
      ext = "jpg";
      contentType = "image/jpeg";
    }
  }
  // Some Android pickers hand over files with no extension in the name.
  if (!ext || ext === file.name.toLowerCase()) {
    ext = (file.type.split("/").pop() || "bin").toLowerCase();
  }

  const path = `${crypto.randomUUID()}.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType,
    upsert: false,
  });
  if (error) return { error: error.message };
  return { path };
}
