"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
import { addCoTenant } from "@/app/(app)/tenants/actions";
import { TENANT_MEDIA_BUCKET } from "@/lib/buckets";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
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

export function AddCoTenantDialog({ tenantId }: { tenantId: string }) {
  const t = useTranslations("tenants");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(0);
  const onBusy = (b: boolean) => setBusy((nb) => nb + (b ? 1 : -1));

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await addCoTenant({}, formData);
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
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        {t("addCoTenant")}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addCoTenant")}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <div className="space-y-2">
            <Label htmlFor="co_add_name">{t("coTenantName")}</Label>
            <Input id="co_add_name" name="co_tenant_name" required />
          </div>
          <div className="space-y-2">
            <Label>{t("coTenantId")}</Label>
            <FileUpload name="co_tenant_national_id" bucket={TENANT_MEDIA_BUCKET} onBusyChange={onBusy} />
          </div>
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
