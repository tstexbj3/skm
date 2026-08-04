import { getTranslations } from "next-intl/server";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/supabase/storage";
import { PAYMENT_SLIPS_BUCKET } from "@/lib/buckets";
import {
  PaymentsTable,
  type PaymentListRow,
} from "@/components/payments/payments-table";

export default async function PaymentsPage() {
  const ctx = await requireModule("payments");
  const supabase = await createClient();

  const { data } = await supabase
    .from("payments")
    .select(
      "id, amount, method, status, slip_image_url, created_at, bill:bills(id, room_number, payer_name)"
    )
    .neq("status", "VOID")
    .order("created_at", { ascending: false })
    .limit(200);

  const raw = (data ?? []) as unknown as Array<{
    id: string;
    amount: string;
    method: string;
    status: string;
    slip_image_url: string | null;
    created_at: string;
    bill: { id: string; room_number: string; payer_name: string } | null;
  }>;

  const rows: PaymentListRow[] = await Promise.all(
    raw.map(async (p) => ({
      id: p.id,
      amount: String(p.amount),
      method: p.method,
      status: p.status,
      room: p.bill?.room_number ?? "—",
      payer: p.bill?.payer_name ?? "—",
      billId: p.bill?.id ?? "",
      createdAt: p.created_at,
      slipUrl: await signedUrl(PAYMENT_SLIPS_BUCKET, p.slip_image_url),
    }))
  );

  const pendingRows = rows.filter((r) => r.status === "RECORDED");
  const otherRows = rows.filter((r) => r.status !== "RECORDED");
  const t = await getTranslations("payments");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      {pendingRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t("pendingApprovals")} ({pendingRows.length})
          </h2>
          <PaymentsTable rows={pendingRows} isOwner={ctx.isOwner} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {t("recent")}
        </h2>
        <PaymentsTable rows={otherRows} isOwner={ctx.isOwner} />
      </section>
    </div>
  );
}
