import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { QR_BUCKET } from "@/lib/buckets";
import { Invoice, type InvoiceAccount } from "@/components/billing/invoice";
import { PrintButton } from "@/components/billing/print-button";

export default async function PrintBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: bill } = await supabase
    .from("bills")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!bill) notFound();

  const { data: items } = await supabase
    .from("bill_line_items")
    .select("label, amount")
    .eq("bill_id", id)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true });

  const { data: property } = await supabase
    .from("property_settings")
    .select("name, address")
    .limit(1)
    .maybeSingle();

  let account: InvoiceAccount = null;
  if (bill.payment_account_id) {
    const { data: acc } = await supabase
      .from("payment_accounts")
      .select("bank_name, account_name, account_number, qr_image_url")
      .eq("id", bill.payment_account_id)
      .maybeSingle();
    if (acc)
      account = {
        bank_name: acc.bank_name as string,
        account_name: acc.account_name as string,
        account_number: acc.account_number as string,
        qrUrl: acc.qr_image_url
          ? supabase.storage.from(QR_BUCKET).getPublicUrl(acc.qr_image_url as string)
              .data.publicUrl
          : null,
      };
  }

  const t = await getTranslations("billing");

  return (
    <div className="mx-auto max-w-2xl bg-white p-8">
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton label={t("print")} billId={id} />
      </div>
      <Invoice
        bill={bill}
        items={items ?? []}
        property={{
          name: (property?.name as string) ?? "",
          address: (property?.address as string) ?? null,
        }}
        account={account}
      />
    </div>
  );
}
