"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
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

/**
 * Multi-file variant for multi-page documents (e.g. a contract scan): each
 * selection uploads immediately and appends to the page list; selecting again
 * adds more pages. Every uploaded path is submitted as a hidden field with the
 * same name, so the server action reads them via formData.getAll(name).
 */
export function MultiFileUpload({
  name,
  bucket,
  accept = "image/*",
  onBusyChange,
  startIndex = 0,
}: {
  name: string;
  bucket: string;
  accept?: string;
  onBusyChange?: (busy: boolean) => void;
  /** Offset for page numbering when pages already exist (edit dialogs). */
  startIndex?: number;
}) {
  const t = useTranslations("common");
  const [paths, setPaths] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">(
    "idle"
  );
  const [err, setErr] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setStatus("uploading");
    setErr(null);
    onBusyChange?.(true);
    let failed: string | null = null;
    for (const file of files) {
      const res = await uploadFile(bucket, file);
      if (res.path) {
        const p = res.path;
        setPaths((prev) => [...prev, p]);
      } else {
        failed = res.error ?? "error";
      }
    }
    onBusyChange?.(false);
    if (failed) {
      setStatus("error");
      setErr(failed);
    } else {
      setStatus("done");
    }
    e.target.value = "";
  }

  return (
    <div className="space-y-1">
      <input
        type="file"
        multiple
        accept={accept}
        onChange={onChange}
        className={fileClass}
      />
      {paths.map((p, i) => (
        <div
          key={p}
          className="flex items-center justify-between rounded-md border px-2 py-1 text-xs"
        >
          <span className="text-muted-foreground">
            {t("pageN", { n: startIndex + i + 1 })}
          </span>
          <input type="hidden" name={name} value={p} />
          <button
            type="button"
            aria-label={t("removePage")}
            onClick={() =>
              setPaths((prev) => prev.filter((_, idx) => idx !== i))
            }
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {status === "uploading" && (
        <span className="text-xs text-muted-foreground">{t("uploading")}</span>
      )}
      {status === "done" && paths.length > 0 && (
        <span className="text-xs text-emerald-600">
          {t("uploadedPages", { n: paths.length })}
        </span>
      )}
      {status === "error" && (
        <span className="text-xs text-destructive">{err}</span>
      )}
    </div>
  );
}
