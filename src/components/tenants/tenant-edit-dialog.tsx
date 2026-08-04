"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { updateTenant } from "@/app/(app)/tenants/actions";
import { Button } from "@/components/ui/button";
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

const fileClass =
  "block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:py-1 file:text-sm file:font-medium hover:file:bg-accent";

export function TenantEditDialog({
  tenant,
}: {
  tenant: {
    id: string;
    full_name: string;
    phone: string | null;
    co_tenant_name: string | null;
  };
}) {
  const t = useTranslations("tenants");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
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
            <Label htmlFor="edit_photo">{t("photo")}</Label>
            <input
              id="edit_photo"
              name="photo"
              type="file"
              accept="image/*"
              className={fileClass}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit_national_id">{t("nationalId")}</Label>
              <input
                id="edit_national_id"
                name="national_id"
                type="file"
                accept="image/*"
                className={fileClass}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_co_tenant_national_id">
                {t("coTenantId")}
              </Label>
              <input
                id="edit_co_tenant_national_id"
                name="co_tenant_national_id"
                type="file"
                accept="image/*"
                className={fileClass}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
