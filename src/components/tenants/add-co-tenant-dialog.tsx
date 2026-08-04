"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
import { addCoTenant } from "@/app/(app)/tenants/actions";
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

export function AddCoTenantDialog({ tenantId }: { tenantId: string }) {
  const t = useTranslations("tenants");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
            <Label htmlFor="co_add_id">{t("coTenantId")}</Label>
            <input
              id="co_add_id"
              name="co_tenant_national_id"
              type="file"
              accept="image/*"
              className={fileClass}
            />
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
