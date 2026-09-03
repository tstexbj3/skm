"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, FolderOpen, X } from "lucide-react";
import { uploadFile } from "@/lib/supabase/upload";

// Two explicit buttons instead of a bare <input type="file">: Android Chrome's
// photo picker for accept="image/*" offers NO camera option, so taking a photo
// on the spot needs its own input with the `capture` attribute (which opens the
// camera directly on both Android and iPhone).
const btnClass =
  "inline-flex items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm font-medium hover:bg-accent";

function PickerButtons({
  accept,
  multiple,
  onChange,
}: {
  accept: string;
  multiple?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const t = useTranslations("common");
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => camRef.current?.click()}
        className={btnClass}
      >
        <Camera className="size-4" />
        {t("takePhoto")}
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={btnClass}
      >
        <FolderOpen className="size-4" />
        {t("chooseFile")}
      </button>
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onChange}
        className="hidden"
      />
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={onChange}
        className="hidden"
      />
    </div>
  );
}

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
    e.target.value = "";
  }

  return (
    <div className="space-y-1">
      <PickerButtons accept={accept} onChange={onChange} />
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
      <PickerButtons accept={accept} multiple onChange={onChange} />
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
