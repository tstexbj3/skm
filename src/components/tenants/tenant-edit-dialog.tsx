"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pencil, X } from "lucide-react";
import { updateTenant } from "@/app/(app)/tenants/actions";
import { TENANT_MEDIA_BUCKET } from "@/lib/buckets";
import { Button } from "@/components/ui/button";
import { FileUpload, MultiFileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

export function TenantEditDialog({
  tenant,
  contract,
}: {
  tenant: {
    id: string;
    full_name: string;
    phone: string | null;
    co_tenant_name: string | null;
  };
  contract?: { id: string; scan_urls: string[] } | null;
}) {
  const t = useTranslations("tenants");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(0);
  const onBusy = (b: boolean) => setBusy((nb) => nb + (b ? 1 : -1));
  // Existing contract pages the user keeps (reset each time the dialog opens).
  const [keptPages, setKeptPages] = useState<string[]>([]);

  function openDialog() {
    setKeptPages(contract?.scan_urls ?? []);
    setError(null);
    setOpen(true);
  }

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await updateTenant({}, formData);
      if (res.ok) {
        setError(null);
        setOpen(false);
      } else {
        const key = res.error ?? "error";
        setError(t.has(`errors.${key}`) ? t(`errors.${key}`) : key);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={openDialog}>
        <Pencil className="size-4" />
        {t("edit")}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTenant")}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="id" value={tenant.id} />

          <div className="space-y-2">
            <Label htmlFor="edit_full_name">{t("fullName")}</Label>
            <Input
              id="edit_full_name"
              name="full_name"
              defaultValue={tenant.full_name}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit_phone">{t("phone")}</Label>
              <Input
                id="edit_phone"
                name="phone"
                type="tel"
                defaultValue={tenant.phone ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_co_tenant_name">{t("coTenantName")}</Label>
              <Input
                id="edit_co_tenant_name"
                name="co_tenant_name"
                defaultValue={tenant.co_tenant_name ?? ""}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t("replaceHint")}</p>
          <div className="space-y-2">
            <Label>{t("photo")}</Label>
            <FileUpload name="photo" bucket={TENANT_MEDIA_BUCKET} onBusyChange={onBusy} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("nationalId")}</Label>
              <FileUpload name="national_id" bucket={TENANT_MEDIA_BUCKET} onBusyChange={onBusy} />
            </div>
            <div className="space-y-2">
              <Label>{t("coTenantId")}</Label>
              <FileUpload name="co_tenant_national_id" bucket={TENANT_MEDIA_BUCKET} onBusyChange={onBusy} />
            </div>
          </div>

          {contract && (
            <div className="space-y-2">
              <Label>{t("contractScan")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("contractPagesHint")}
              </p>
              <input type="hidden" name="contract_id" value={contract.id} />
              {keptPages.map((p, i) => (
                <div
                  key={p}
                  className="flex items-center justify-between rounded-md border px-2 py-1 text-xs"
                >
                  <span className="text-muted-foreground">
                    {tc("pageN", { n: i + 1 })}
                  </span>
                  <input type="hidden" name="contract_scan_keep" value={p} />
                  <button
                    type="button"
                    aria-label={tc("removePage")}
                    onClick={() =>
                      setKeptPages((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              <MultiFileUpload
                name="contract_scan"
                bucket={TENANT_MEDIA_BUCKET}
                onBusyChange={onBusy}
                startIndex={keptPages.length}
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || busy > 0}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
