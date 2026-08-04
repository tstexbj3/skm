"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, UserMinus } from "lucide-react";
import { renewContract, endTenancy } from "@/app/(app)/tenants/actions";
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
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

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
  const [busy, setBusy] = useState(0);
  const onBusy = (b: boolean) => setBusy((nb) => nb + (b ? 1 : -1));

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
            <Label>{t("newContractScan")}</Label>
            <FileUpload name="contract_scan" bucket={TENANT_MEDIA_BUCKET} onBusyChange={onBusy} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || busy > 0}>
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
