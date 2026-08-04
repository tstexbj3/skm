"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { approveExpense, voidExpense } from "@/app/(app)/expenses/actions";
import { EXPENSE_STATUS_BADGE } from "@/lib/expenses";
import { formatMoney2 } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

export type ExpenseRow = {
  id: string;
  category: string;
  amount: string;
  description: string;
  room: string;
  date: string;
  status: string;
  billUrl: string | null;
  itemUrl: string | null;
};

export function ExpensesTable({
  rows,
  isOwner,
}: {
  rows: ExpenseRow[];
  isOwner: boolean;
}) {
  const t = useTranslations("expenses");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ackRow, setAckRow] = useState<ExpenseRow | null>(null);

  function doApprove(id: string, ack: boolean) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("ack", String(ack));
      const res = await approveExpense({}, fd);
      if (res.ok) setAckRow(null);
      else if (res.error === "need_ack") {
        const row = rows.find((r) => r.id === id);
        if (row) setAckRow(row);
      } else setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error ?? "error");
    });
  }

  function doVoid(id: string) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await voidExpense({}, fd);
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
              <th className="px-4 py-2 font-medium">{t("category")}</th>
              <th className="px-4 py-2 font-medium">{t("where")}</th>
              <th className="px-4 py-2 font-medium">{t("amount")}</th>
              <th className="px-4 py-2 font-medium">{t("date")}</th>
              <th className="px-4 py-2 font-medium">{t("photos")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs",
                      EXPENSE_STATUS_BADGE[e.status]
                    )}
                  >
                    {t(`status.${e.status}`)}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div>{t(`categories.${e.category}`)}</div>
                  {e.description && (
                    <div className="text-xs text-muted-foreground">
                      {e.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2">{e.room}</td>
                <td className="px-4 py-2 font-medium">฿{formatMoney2(Number(e.amount))}</td>
                <td className="px-4 py-2 text-muted-foreground">{e.date}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2 text-xs">
                    {e.billUrl ? (
                      <a href={e.billUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {t("bill")}
                      </a>
                    ) : (
                      <span className="text-amber-600">{t("noBill")}</span>
                    )}
                    {e.itemUrl && (
                      <a href={e.itemUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {t("item")}
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2">
                  {isOwner && (
                    <div className="flex justify-end gap-2">
                      {e.status === "PENDING_APPROVAL" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => doApprove(e.id, false)}
                        >
                          {t("approve")}
                        </Button>
                      )}
                      {(e.status === "PENDING_APPROVAL" || e.status === "APPROVED") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          disabled={pending}
                          onClick={() => doVoid(e.id)}
                        >
                          {t("void")}
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={ackRow !== null} onOpenChange={(o) => !o && setAckRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              {t("noBillWarning")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("noBillWarningBody")}</p>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={pending}
              onClick={() => ackRow && doApprove(ackRow.id, true)}
            >
              {t("approveAnyway")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
