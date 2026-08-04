"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import {
  addRecurringCharge,
  removeRecurringCharge,
} from "@/app/(app)/tenants/actions";
import { formatMoney } from "@/lib/rooms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type RecurringItem = { id: string; label: string; amount: string };

export function RecurringCharges({
  contractId,
  tenantId,
  items,
  isOwner,
}: {
  contractId: string;
  tenantId: string;
  items: RecurringItem[];
  isOwner: boolean;
}) {
  const t = useTranslations("tenants");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await addRecurringCharge({}, formData);
      if (res.error)
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("tenant_id", tenantId);
      const res = await removeRecurringCharge({}, fd);
      if (res.error)
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("recurringTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("recurringEmpty")}</p>
        ) : (
          <ul className="divide-y">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span>{it.label}</span>
                <div className="flex items-center gap-3">
                  <span className="font-medium">฿{formatMoney(it.amount)}</span>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => remove(it.id)}
                      disabled={pending}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={t("remove")}
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <form action={add} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="contract_id" value={contractId} />
          <input type="hidden" name="tenant_id" value={tenantId} />
          <Input
            name="label"
            placeholder={t("chargeLabel")}
            required
            className="h-8 w-48"
          />
          <Input
            name="amount"
            type="number"
            min={0}
            step="any"
            placeholder="0"
            className="h-8 w-28"
          />
          <Button size="sm" variant="outline" type="submit" disabled={pending}>
            <Plus className="size-4" />
            {t("addCharge")}
          </Button>
        </form>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
