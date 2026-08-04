import { getTranslations } from "next-intl/server";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/supabase/storage";
import { EXPENSE_MEDIA_BUCKET } from "@/lib/buckets";
import { RecordExpense } from "@/components/expenses/record-expense";
import {
  ExpensesTable,
  type ExpenseRow,
} from "@/components/expenses/expenses-table";

export default async function ExpensesPage() {
  const ctx = await requireModule("expenses");
  const supabase = await createClient();
  const t = await getTranslations("expenses");

  const { data: rooms } = await supabase
    .from("rooms")
    .select("id, room_number")
    .order("floor", { ascending: true })
    .order("room_number", { ascending: true });

  const { data } = await supabase
    .from("expenses")
    .select(
      "id, category, amount, description, expense_date, status, is_common_area, bill_image_url, item_image_url, room:rooms(room_number)"
    )
    .neq("status", "VOID")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const raw = (data ?? []) as unknown as Array<{
    id: string;
    category: string;
    amount: string;
    description: string | null;
    expense_date: string;
    status: string;
    is_common_area: boolean;
    bill_image_url: string | null;
    item_image_url: string | null;
    room: { room_number: string } | null;
  }>;

  const rows: ExpenseRow[] = await Promise.all(
    raw.map(async (e) => ({
      id: e.id,
      category: e.category,
      amount: String(e.amount),
      description: e.description ?? "",
      room: e.is_common_area ? t("commonArea") : e.room?.room_number ?? "—",
      date: e.expense_date,
      status: e.status,
      billUrl: await signedUrl(EXPENSE_MEDIA_BUCKET, e.bill_image_url),
      itemUrl: await signedUrl(EXPENSE_MEDIA_BUCKET, e.item_image_url),
    }))
  );

  const pending = rows.filter((r) => r.status === "PENDING_APPROVAL");
  const others = rows.filter((r) => r.status !== "PENDING_APPROVAL");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <RecordExpense rooms={rooms ?? []} />

      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t("pending")} ({pending.length})
          </h2>
          <ExpensesTable rows={pending} isOwner={ctx.isOwner} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {t("recent")}
        </h2>
        <ExpensesTable rows={others} isOwner={ctx.isOwner} />
      </section>
    </div>
  );
}
