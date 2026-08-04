"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Trash2, AlertTriangle } from "lucide-react";
import { purgeTenant } from "@/app/(app)/tenants/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

export function PurgeTenantDialog({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}) {
  const t = useTranslations("tenants");
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canDelete = confirm.trim() === tenantName.trim();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await purgeTenant({}, formData);
      // success redirects; only errors return here
      if (res?.error) {
        const key = res.error;
        setError(t.has(`errors.${key}`) ? t(`errors.${key}`) : key);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
        {t("purge")}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            {t("purgeTitle")}
          </DialogTitle>
          <DialogDescription>{t("purgeHint")}</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <div className="space-y-2">
            <Label htmlFor="purge_reason">{t("purgeReason")}</Label>
            <Input id="purge_reason" name="reason" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="purge_confirm">
              {t("purgeConfirm", { name: tenantName })}
            </Label>
            <Input
              id="purge_confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || !canDelete}
            >
              {t("purgeConfirmBtn")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
