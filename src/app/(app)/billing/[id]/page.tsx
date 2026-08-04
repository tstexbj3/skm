import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BILL_STATUS_BADGE, type BillStatus } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { signedUrl } from "@/lib/supabase/storage";
import { PAYMENT_SLIPS_BUCKET } from "@/lib/buckets";
import { BillForm, type BillData, type LineItem } from "@/components/billing/bill-form";
import { BillAccountSelect } from "@/components/billing/bill-account-select";
import { BillWorkflow } from "@/components/billing/bill-workflow";
import { DeleteBillDialog } from "@/components/billing/delete-bill-dialog";
import {
  PaymentPanel,
  type PaymentRow,
} from "@/components/billing/payment-panel";

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireModule("billing");
  const { id } = await params;
  const supabase = await createClient();

  const { data: bill } = await supabase
    .from("bills")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!bill) notFound();

  const { data: items } = await supabase
    .from("bill_line_items")
    .select("id, label, amount, status")
    .eq("bill_id", id)
    .order("created_at", { ascending: true });

  const { data: accts } = await supabase
    .from("payment_accounts")
    .select("id, bank_name, account_number")
    .eq("active", true)
    .order("created_at", { ascending: true });
  const accounts = (accts ?? []).map((a) => ({
    id: a.id as string,
    label: `${a.bank_name} · ${a.account_number}`,
  }));

  const { data: paymentsData } = await supabase
    .from("payments")
    .select("id, amount, method, status, slip_image_url, created_at")
    .eq("bill_id", id)
    .neq("status", "VOID")
    .order("created_at", { ascending: false });
  const paymentRows: PaymentRow[] = await Promise.all(
    (paymentsData ?? []).map(async (p) => ({
      id: p.id as string,
      amount: String(p.amount),
      method: p.method as string,
      status: p.status as string,
      created_at: p.created_at as string,
      slipUrl: await signedUrl(PAYMENT_SLIPS_BUCKET, p.slip_image_url as string | null),
    }))
  );

  const t = await getTranslations("billing");
  const editable = bill.status === "DRAFT";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/billing"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("invoiceTitle")}
          </h1>
          <span
            className={cn(
              "rounded px-2 py-0.5 text-xs",
              BILL_STATUS_BADGE[bill.status as BillStatus]
            )}
          >
            {t(`statuses.${bill.status}`)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BillWorkflow
            id={bill.id}
            status={bill.status}
            isOwner={ctx.isOwner}
            printCount={bill.print_count ?? 0}
          />
          {ctx.isOwner && <DeleteBillDialog billId={bill.id} />}
        </div>
      </div>

      <BillForm
        bill={bill as unknown as BillData}
        lineItems={(items ?? []) as LineItem[]}
        accounts={accounts}
        editable={editable}
      />

      {bill.status !== "DRAFT" && (
        <BillAccountSelect
          billId={bill.id}
          currentAccountId={bill.payment_account_id ?? null}
          accounts={accounts}
        />
      )}

      {bill.status !== "DRAFT" && (
        <PaymentPanel
          billId={bill.id}
          total={Number(bill.total_amount)}
          payments={paymentRows}
          isOwner={ctx.isOwner}
        />
      )}
    </div>
  );
}
