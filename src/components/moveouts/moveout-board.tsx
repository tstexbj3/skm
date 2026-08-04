"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LogOut, AlertTriangle } from "lucide-react";
import {
  notifyMoveout,
  setMoveoutFinancials,
  approveMoveout,
  completeMoveout,
  fledMoveout,
} from "@/app/(app)/moveouts/actions";
import { formatMoney2 } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const STATUS_BADGE: Record<string, string> = {
  NOTIFIED: "border-transparent bg-amber-500 text-white",
  APPROVED: "border-transparent bg-emerald-600 text-white",
  COMPLETED: "border-transparent bg-blue-500 text-white",
  FLED: "border-transparent bg-red-600 text-white",
};

export type ActiveContract = { id: string; label: string };
export type Moveout = {
  id: string;
  room: string;
  tenant: string;
  notice_date: string;
  move_out_date: string;
  notice_days: number;
  red_flag_no_refund: boolean;
  status: string;
  damage_deposit_snapshot: string;
  damage_deductions: string;
  damage_deposit_refund: string;
  last_month_rent: string;
};

export function MoveoutBoard({
  contracts,
  moveouts,
  isOwner,
}: {
  contracts: ActiveContract[];
  moveouts: Moveout[];
  isOwner: boolean;
}) {
  const t = useTranslations("moveouts");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  function run(
    action: (p: object, fd: FormData) => Promise<{ error?: string; ok?: boolean }>,
    fd: FormData
  ) {
    setError(null);
    startTransition(async () => {
      const res = await action({}, fd);
      if (res.error)
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
    });
  }

  return (
    <div className="space-y-6">
      {/* Notify */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("notify")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={(fd) => run(notifyMoveout, fd)}
            className="grid gap-3 sm:grid-cols-3"
          >
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="contract_id" className="text-xs">
                {t("tenant")}
              </Label>
              <select id="contract_id" name="contract_id" className={selectClass} required>
                <option value="">—</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="move_out_date" className="text-xs">
                {t("moveOutDate")}
              </Label>
              <Input id="move_out_date" name="move_out_date" type="date" min={today} required />
            </div>
            <div className="sm:col-span-3">
              <Button size="sm" disabled={pending} type="submit">
                <LogOut className="size-4" />
                {t("notify")}
              </Button>
              {error && <span className="ml-3 text-sm text-destructive">{error}</span>}
            </div>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">{t("notifyHint")}</p>
        </CardContent>
      </Card>

      {/* List */}
      {moveouts.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        moveouts.map((m) => (
          <Card key={m.id}>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {t("room")} {m.room} · {m.tenant}
                <span className={cn("rounded px-2 py-0.5 text-xs", STATUS_BADGE[m.status])}>
                  {t(`status.${m.status}`)}
                </span>
                {m.red_flag_no_refund && (
                  <span className="flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs text-white">
                    <AlertTriangle className="size-3" />
                    {t("noRefund")}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label={t("noticeDate")}>{m.notice_date}</Field>
                <Field label={t("moveOutDate")}>{m.move_out_date}</Field>
                <Field label={t("noticeDays")}>{m.notice_days}</Field>
                <Field label={t("deposit")}>
                  ฿{formatMoney2(Number(m.damage_deposit_snapshot))}
                </Field>
                <Field label={t("lastMonthRent")}>
                  ฿{formatMoney2(Number(m.last_month_rent))} → 0
                </Field>
                <Field label={t("deductions")}>
                  ฿{formatMoney2(Number(m.damage_deductions))}
                </Field>
                <Field label={t("refund")}>
                  ฿{formatMoney2(Number(m.damage_deposit_refund))}
                </Field>
              </div>

              {isOwner && m.status === "NOTIFIED" && (
                <div className="space-y-3 border-t pt-3">
                  <form
                    action={(fd) => run(setMoveoutFinancials, fd)}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="id" value={m.id} />
                    <div className="space-y-1">
                      <Label htmlFor={`ded-${m.id}`} className="text-xs">
                        {t("deductions")}
                      </Label>
                      <Input
                        id={`ded-${m.id}`}
                        name="damage_deductions"
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={m.damage_deductions}
                        className="h-8 w-32"
                      />
                    </div>
                    <Button size="sm" variant="outline" type="submit" disabled={pending}>
                      {t("setDeductions")}
                    </Button>
                  </form>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("id", m.id);
                        run(approveMoveout, fd);
                      }}
                    >
                      {t("approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={pending}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("id", m.id);
                        run(fledMoveout, fd);
                      }}
                    >
                      {t("fled")}
                    </Button>
                  </div>
                </div>
              )}

              {isOwner && m.status === "APPROVED" && (
                <div className="border-t pt-3">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("id", m.id);
                      run(completeMoveout, fd);
                    }}
                  >
                    {t("complete")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}
