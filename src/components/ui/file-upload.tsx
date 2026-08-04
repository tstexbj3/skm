"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { uploadFile } from "@/lib/supabase/upload";

const fileClass =
  "block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:py-1 file:text-sm file:font-medium hover:file:bg-accent";

/**
 * File input that uploads to Storage on selection and submits the resulting
 * path via a hidden field (name). The server action reads the path string.
 */
export function FileUpload({
  name,
  bucket,
  accept = "image/*",
  onBusyChange,
}: {
  name: string;
  bucket: string;
  accept?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useTranslations("common");
  const [path, setPath] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">(
    "idle"
  );
  const [err, setErr] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPath("");
      setStatus("idle");
      return;
    }
    setStatus("uploading");
    setErr(null);
    onBusyChange?.(true);
    const res = await uploadFile(bucket, file);
    onBusyChange?.(false);
    if (res.path) {
      setPath(res.path);
      setStatus("done");
    } else {
      setStatus("error");
      setErr(res.error ?? "error");
    }
  }

  return (
    <div className="space-y-1">
      <input type="file" accept={accept} onChange={onChange} className={fileClass} />
      <input type="hidden" name={name} value={path} />
      {status === "uploading" && (
        <span className="text-xs text-muted-foreground">{t("uploading")}</span>
      )}
      {status === "done" && (
        <span className="text-xs text-emerald-600">{t("uploaded")}</span>
      )}
      {status === "error" && (
        <span className="text-xs text-destructive">{err}</span>
      )}
    </div>
  );
}
