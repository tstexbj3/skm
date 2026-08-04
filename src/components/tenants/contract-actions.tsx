"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, UserMinus } from "lucide-react";
import { renewContract, endTenancy } from "@/app/(app)/tenants/actions";
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

const fileClass =
  "block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:py-1 file:text-sm file:font-medium hover:file:bg-accent";

export function ContractActions({
  contractId,
  tenantId,
}: {
  contractId: string;
  tenantId: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <RenewDialog contractId={contractId} tenantId={tenantId} />
      <EndDialog contractId={contractId} tenantId={tenantId} />
    </div>
  );
}

function RenewDialog({
  contractId,
  tenantId,
}: {
  contractId: string;
  tenantId: string;
}) {
  const t = useTranslations("tenants");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await renewContract({}, formData);
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
        <RefreshCw className="size-4" />
        {t("renew")}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("renewTitle")}</DialogTitle>
          <DialogDescription>{t("renewHint")}</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="contract_id" value={contractId} />
          <input type="hidden" name="tenant_id" value={tenantId} />
          <div className="space-y-2">
            <Label htmlFor="renew_term">{t("termMonths")}</Label>
            <Input
              id="renew_term"
              name="term_months"
              type="number"
              min={1}
              step={1}
              defaultValue={12}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="renew_scan">{t("newContractScan")}</Label>
            <input
              id="renew_scan"
              name="contract_scan"
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
              {t("renew")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EndDialog({
  contractId,
  tenantId,
}: {
  contractId: string;
  tenantId: string;
}) {
  const t = useTranslations("tenants");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("contract_id", contractId);
      fd.set("tenant_id", tenantId);
      const res = await endTenancy({}, fd);
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
      <Button
        size="sm"
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <UserMinus className="size-4" />
        {t("endTenancy")}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("endTenancy")}</DialogTitle>
          <DialogDescription>{t("endHint")}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            {t("confirmEnd")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
