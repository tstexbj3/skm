"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import {
  recordPayment,
  approvePayment,
  voidPayment,
} from "@/app/(app)/payments/actions";
import {
  paidAmount,
  pendingAmount,
  payState,
  PAY_STATE_BADGE,
  PAYMENT_STATUS_BADGE,
} from "@/lib/payments";
import { formatMoney2 } from "@/lib/billing";
import { PAYMENT_SLIPS_BUCKET } from "@/lib/buckets";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type PaymentRow = {
  id: string;
  amount: string;
  method: string;
  status: string;
  slipUrl: string | null;
  created_at: string;
};

const selectClass =
  "flex h-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function PaymentPanel({
  billId,
  total,
  payments,
  isOwner,
}: {
  billId: string;
  total: number;
  payments: PaymentRow[];
  isOwner: boolean;
}) {
  const t = useTranslations("payments");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);
  const onBusy = (b: boolean) => setBusy((nb) => nb + (b ? 1 : -1));

  const paid = paidAmount(payments);
  const pend = pendingAmount(payments);
  const outstanding = Math.max(0, Math.round((total - paid) * 100) / 100);
  const state = payState(total, paid);

  function record(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await recordPayment({}, formData);
      if (res.error)
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
    });
  }

  function act(
    action: typeof approvePayment | typeof voidPayment,
    id: string
  ) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await action({}, fd);
      if (res.error)
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <span
          className={cn("rounded px-2 py-0.5 text-xs", PAY_STATE_BADGE[state])}
        >
          {t(`state.${state}`)}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-6 text-sm">
          <Stat label={t("paid")}>฿{formatMoney2(paid)}</Stat>
          <Stat label={t("outstanding")}>฿{formatMoney2(outstanding)}</Stat>
          {pend > 0 && (
            <Stat label={t("pending")}>฿{formatMoney2(pend)}</Stat>
          )}
        </div>

        {payments.length > 0 && (
          <ul className="divide-y text-sm">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs",
                      PAYMENT_STATUS_BADGE[p.status]
                    )}
                  >
                    {t(`status.${p.status}`)}
                  </span>
                  <span>{t(`methods.${p.method}`)}</span>
                  <span className="font-medium">฿{formatMoney2(Number(p.amount))}</span>
                  {p.slipUrl && (
                    <a
                      href={p.slipUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {t("viewSlip")}
                    </a>
                  )}
                </div>
                {isOwner && (
                  <div className="flex gap-2">
                    {p.status === "RECORDED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => act(approvePayment, p.id)}
                      >
                        {t("approve")}
                      </Button>
                    )}
                    {(p.status === "RECORDED" || p.status === "APPROVED") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        disabled={pending}
                        onClick={() => act(voidPayment, p.id)}
                      >
                        {t("void")}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <form action={record} className="flex flex-wrap items-end gap-2 border-t pt-4">
          <input type="hidden" name="bill_id" value={billId} />
          <div className="space-y-1">
            <Label htmlFor="method" className="text-xs">
              {t("method")}
            </Label>
            <select id="method" name="method" className={selectClass} defaultValue="TRANSFER">
              <option value="TRANSFER">{t("methods.TRANSFER")}</option>
              <option value="CASH">{t("methods.CASH")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="amount" className="text-xs">
              {t("amount")}
            </Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              min={0}
              step="any"
              defaultValue={outstanding || ""}
              className="h-8 w-32"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("slip")}</Label>
            <FileUpload name="slip" bucket={PAYMENT_SLIPS_BUCKET} onBusyChange={onBusy} />
          </div>
          <Button size="sm" type="submit" disabled={pending || busy > 0}>
            <Plus className="size-4" />
            {t("record")}
          </Button>
        </form>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{children}</div>
    </div>
  );
}
