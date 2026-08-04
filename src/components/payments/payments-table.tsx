"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { approvePayment, voidPayment } from "@/app/(app)/payments/actions";
import { PAYMENT_STATUS_BADGE } from "@/lib/payments";
import { formatMoney2 } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type PaymentListRow = {
  id: string;
  amount: string;
  method: string;
  status: string;
  room: string;
  payer: string;
  billId: string;
  createdAt: string;
  slipUrl: string | null;
};

export function PaymentsTable({
  rows,
  isOwner,
}: {
  rows: PaymentListRow[];
  isOwner: boolean;
}) {
  const t = useTranslations("payments");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(action: typeof approvePayment | typeof voidPayment, id: string) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await action({}, fd);
      if (res.error)
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
    });
  }

  if (rows.length === 0)
    return <p className="text-muted-foreground">{t("empty")}</p>;

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">{t("statusCol")}</th>
              <th className="px-4 py-2 font-medium">{t("room")}</th>
              <th className="px-4 py-2 font-medium">{t("payer")}</th>
              <th className="px-4 py-2 font-medium">{t("method")}</th>
              <th className="px-4 py-2 font-medium">{t("amount")}</th>
              <th className="px-4 py-2 font-medium">{t("date")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs",
                      PAYMENT_STATUS_BADGE[p.status]
                    )}
                  >
                    {t(`status.${p.status}`)}
                  </span>
                </td>
                <td className="px-4 py-2 font-medium">
                  <Link href={`/billing/${p.billId}`} className="hover:underline">
                    {p.room}
                  </Link>
                </td>
                <td className="px-4 py-2">{p.payer}</td>
                <td className="px-4 py-2">{t(`methods.${p.method}`)}</td>
                <td className="px-4 py-2 font-medium">
                  ฿{formatMoney2(Number(p.amount))}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {p.createdAt.slice(0, 10)}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-2">
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
                    {isOwner && p.status === "RECORDED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => act(approvePayment, p.id)}
                      >
                        {t("approve")}
                      </Button>
                    )}
                    {isOwner &&
                      (p.status === "RECORDED" || p.status === "APPROVED") && (
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
