import { getTranslations } from "next-intl/server";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { billingPeriod, monthToDate } from "@/lib/billing";
import { BillingBoard, type BillRow } from "@/components/billing/billing-board";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireModule("billing");
  const supabase = await createClient();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : billingPeriod();
  const billing_month = monthToDate(month);

  const { data: contractsData } = await supabase
    .from("contracts")
    .select("id, room:rooms(room_number), tenant:tenants(full_name)")
    .eq("status", "ACTIVE");
  const { data: billsData } = await supabase
    .from("bills")
    .select("id, contract_id, status, total_amount")
    .eq("billing_month", billing_month);

  // Approved/reconciled payments per bill → paid amount for the list view.
  const billIds = (billsData ?? []).map((b) => b.id as string);
  const { data: paysData } = billIds.length
    ? await supabase
        .from("payments")
        .select("bill_id, amount, status")
        .in("bill_id", billIds)
    : { data: [] as { bill_id: string; amount: string; status: string }[] };
  const paidByBill = new Map<string, number>();
  for (const p of paysData ?? []) {
    if (p.status === "APPROVED" || p.status === "RECONCILED") {
      const k = p.bill_id as string;
      paidByBill.set(k, (paidByBill.get(k) ?? 0) + Number(p.amount));
    }
  }

  const billMap = new Map(
    (billsData ?? []).map((b) => [b.contract_id as string, b])
  );
  const contracts = (contractsData ?? []) as unknown as Array<{
    id: string;
    room: { room_number: string } | null;
    tenant: { full_name: string } | null;
  }>;

  const rows: BillRow[] = contracts
    .map((c) => {
      const b = billMap.get(c.id);
      return {
        contractId: c.id,
        room: c.room?.room_number ?? "—",
        tenant: c.tenant?.full_name ?? "—",
        bill: b
          ? {
              id: b.id as string,
              status: b.status as string,
              total: String(b.total_amount),
              paid: paidByBill.get(b.id as string) ?? 0,
            }
          : null,
      };
    })
    .sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }));

  const t = await getTranslations("billing");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <BillingBoard month={month} rows={rows} />
    </div>
  );
}
