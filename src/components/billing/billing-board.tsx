"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { generateBill, generateAllBills } from "@/app/(app)/billing/actions";
import { BILL_STATUS_BADGE, type BillStatus } from "@/lib/billing";
import { formatMoney } from "@/lib/rooms";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type BillRow = {
  contractId: string;
  room: string;
  tenant: string;
  bill: { id: string; status: string; total: string } | null;
};

export function BillingBoard({
  month,
  rows,
}: {
  month: string;
  rows: BillRow[];
}) {
  const t = useTranslations("billing");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function gen(contractId: string) {
    setError(null);
    startTransition(async () => {
      const res = await generateBill(contractId, month);
      if (res?.error)
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
    });
  }

  function genAll() {
    setError(null);
    startTransition(async () => {
      const res = await generateAllBills(month);
      if (res?.error)
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
    });
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function printSelected() {
    if (selected.size)
      window.open(`/print/bills?ids=${[...selected].join(",")}`, "_blank");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("month")}</span>
        <Input
          type="month"
          defaultValue={month}
          className="w-44"
          onChange={(e) =>
            e.target.value && router.push(`/billing?month=${e.target.value}`)
          }
        />
        <Button size="sm" variant="outline" disabled={pending} onClick={genAll}>
          {t("generateAll")}
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/print/month/${month}`} target="_blank">
            {t("printAll")}
          </Link>
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={selected.size === 0}
          onClick={printSelected}
        >
          {t("printSelected")} ({selected.size})
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="px-4 py-2 font-medium">{t("room")}</th>
              <th className="px-4 py-2 font-medium">{t("payer")}</th>
              <th className="px-4 py-2 font-medium">{t("status")}</th>
              <th className="px-4 py-2 font-medium">{t("total")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.contractId} className="border-t">
                <td className="px-2 py-2">
                  {row.bill && (
                    <input
                      type="checkbox"
                      checked={selected.has(row.bill.id)}
                      onChange={() => toggle(row.bill!.id)}
                      aria-label="select"
                    />
                  )}
                </td>
                <td className="px-4 py-2 font-medium">{row.room}</td>
                <td className="px-4 py-2">{row.tenant}</td>
                <td className="px-4 py-2">
                  {row.bill ? (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs",
                        BILL_STATUS_BADGE[row.bill.status as BillStatus]
                      )}
                    >
                      {t(`statuses.${row.bill.status}`)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {row.bill ? `฿${formatMoney(row.bill.total)}` : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {row.bill ? (
                    <Link
                      href={`/billing/${row.bill.id}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <FileText className="size-4" />
                      {t("open")}
                    </Link>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => gen(row.contractId)}
                    >
                      {t("generate")}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  {t("noContracts")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
