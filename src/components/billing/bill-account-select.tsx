"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setBillAccount } from "@/app/(app)/billing/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function BillAccountSelect({
  billId,
  currentAccountId,
  accounts,
}: {
  billId: string;
  currentAccountId: string | null;
  accounts: { id: string; label: string }[];
}) {
  const t = useTranslations("billing");
  const [value, setValue] = useState(currentAccountId ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("bill_id", billId);
      fd.set("account_id", value);
      const res = await setBillAccount({}, fd);
      if (res.ok) setSaved(true);
      else setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error ?? "error");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("paymentAccount")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={selectClass + " max-w-xs"}
          >
            <option value="">{t("none")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={save} disabled={pending}>
            {t("saveDraft")}
          </Button>
          {saved && <span className="text-sm text-emerald-600">{t("saved")}</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
