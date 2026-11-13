import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { QR_BUCKET } from "@/lib/buckets";
import { Invoice, type InvoiceAccount } from "@/components/billing/invoice";
import { PrintButton } from "@/components/billing/print-button";

export default async function PrintBillsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const sp = await searchParams;
  const ids = String(sp.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: bills } = await supabase
    .from("bills")
    .select("*")
    .in("id", ids)
    .order("room_number", { ascending: true });
  const billList = bills ?? [];

  const billIds = billList.map((b) => b.id as string);
  const { data: allItems } = billIds.length
    ? await supabase
        .from("bill_line_items")
        .select("bill_id, label, amount")
        .in("bill_id", billIds)
        .eq("status", "ACTIVE")
    : { data: [] };
  const itemsByBill = new Map<string, { label: string; amount: string }[]>();
  for (const it of allItems ?? []) {
    const arr = itemsByBill.get(it.bill_id as string) ?? [];
    arr.push({ label: it.label as string, amount: String(it.amount) });
    itemsByBill.set(it.bill_id as string, arr);
  }

  const { data: property } = await supabase
    .from("property_settings")
    .select("name, address")
    .limit(1)
    .maybeSingle();
  const prop = {
    name: (property?.name as string) ?? "",
    address: (property?.address as string) ?? null,
  };

  const acctIds = [
    ...new Set(billList.map((b) => b.payment_account_id).filter(Boolean)),
  ] as string[];
  const { data: accs } = acctIds.length
    ? await supabase
        .from("payment_accounts")
        .select("id, bank_name, account_name, account_number, qr_image_url")
        .in("id", acctIds)
    : { data: [] };
  const acctMap = new Map<string, InvoiceAccount>();
  for (const a of accs ?? []) {
    acctMap.set(a.id as string, {
      bank_name: a.bank_name as string,
      account_name: a.account_name as string,
      account_number: a.account_number as string,
      qrUrl: a.qr_image_url
        ? supabase.storage.from(QR_BUCKET).getPublicUrl(a.qr_image_url as string)
            .data.publicUrl
        : null,
    });
  }

  const t = await getTranslations("billing");

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 print:max-w-none print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <span className="text-sm text-muted-foreground">{billList.length}</span>
        <PrintButton label={t("printAll")} />
      </div>

      {billList.length === 0 ? (
        <p className="text-muted-foreground print:hidden">{t("noBills")}</p>
      ) : (
        billList.map((bill) => (
          <div
            key={bill.id as string}
            className="mb-6 break-after-page last:mb-0 last:break-after-auto print:mb-0"
          >
            <Invoice
              bill={bill}
              items={itemsByBill.get(bill.id as string) ?? []}
              property={prop}
              account={
                bill.payment_account_id
                  ? acctMap.get(bill.payment_account_id as string) ?? null
                  : null
              }
            />
          </div>
        ))
      )}
    </div>
  );
}
