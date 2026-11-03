import { getTranslations } from "next-intl/server";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { billingPeriod, monthToDate, n, formatMoney2 } from "@/lib/billing";
import { addMonths } from "@/lib/contracts";
import { STATUS_DOT } from "@/lib/rooms";
import { cn } from "@/lib/utils";
import { MonthNav } from "@/components/reports/month-nav";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireModule("reports");
  const supabase = await createClient();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : billingPeriod();
  const monthStart = monthToDate(month);
  const monthEnd = addMonths(monthStart, 1);
  const t = await getTranslations("reports");

  // Room status
  const { data: rooms } = await supabase.from("rooms").select("status");
  const total = (rooms ?? []).length;
  const occupied = (rooms ?? []).filter((r) => r.status === "OCCUPIED").length;
  const vacant = (rooms ?? []).filter((r) => r.status === "VACANT").length;
  const pendingOut = (rooms ?? []).filter(
    (r) => r.status === "PENDING_MOVEOUT"
  ).length;
  const rate = total ? Math.round((occupied / total) * 100) : 0;

  // Income for the month
  const { data: monthBills } = await supabase
    .from("bills")
    .select("id, total_amount")
    .eq("billing_month", monthStart);
  const billed = (monthBills ?? []).reduce((s, b) => s + n(b.total_amount), 0);
  const billIds = (monthBills ?? []).map((b) => b.id as string);
  const { data: pays } = billIds.length
    ? await supabase.from("payments").select("amount, status").in("bill_id", billIds)
    : { data: [] };
  const paid = (pays ?? [])
    .filter((p) => p.status === "APPROVED" || p.status === "RECONCILED")
    .reduce((s, p) => s + n(p.amount), 0);
  const outstanding = Math.max(0, billed - paid);

  // Expenses for the month (approved)
  const { data: exps } = await supabase
    .from("expenses")
    .select("category, amount, deduct_from_income")
    .eq("status", "APPROVED")
    .gte("expense_date", monthStart)
    .lt("expense_date", monthEnd);
  const byCategory = new Map<string, number>();
  let expenseTotal = 0;
  for (const e of exps ?? []) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + n(e.amount));
    expenseTotal += n(e.amount);
  }
  const net = paid - expenseTotal;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <MonthNav month={month} />
      </div>

      {/* Room status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("roomStatus")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("occupancy")} value={`${rate}%`} />
          <Stat label={t("occupied")} value={occupied} dot="OCCUPIED" />
          <Stat label={t("vacant")} value={vacant} dot="VACANT" />
          <Stat
            label={t("pendingMoveout")}
            value={pendingOut}
            dot="PENDING_MOVEOUT"
          />
        </CardContent>
      </Card>

      {/* Income */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("income")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Money label={t("billed")} value={billed} />
          <Money label={t("collected")} value={paid} />
          <Money label={t("outstanding")} value={outstanding} />
          <Money label={t("net")} value={net} highlight />
        </CardContent>
      </Card>

      {/* Expense ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("expenseLedger")}</CardTitle>
        </CardHeader>
        <CardContent>
          {byCategory.size === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noExpenses")}</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {[...byCategory.entries()].map(([cat, amt]) => (
                  <tr key={cat} className="border-b">
                    <td className="py-2">{t(`categories.${cat}`)}</td>
                    <td className="py-2 text-right tabular-nums">
                      ฿{formatMoney2(amt)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2">{t("totalExpenses")}</td>
                  <td className="py-2 text-right tabular-nums">
                    ฿{formatMoney2(expenseTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  dot,
}: {
  label: string;
  value: string | number;
  dot?: keyof typeof STATUS_DOT;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {dot && <span className={cn("size-2.5 rounded-full", STATUS_DOT[dot])} />}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Money({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold",
          highlight && (value >= 0 ? "text-emerald-600" : "text-destructive")
        )}
      >
        ฿{formatMoney2(value)}
      </div>
    </div>
  );
}
