import { getTranslations } from "next-intl/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QR_BUCKET } from "@/lib/buckets";
import { PropertyForm } from "@/components/settings/property-form";
import {
  PaymentAccounts,
  type AccountRow,
} from "@/components/settings/payment-accounts";

export default async function SettingsPage() {
  await getSessionContext();
  const supabase = await createClient();

  const { data: prop } = await supabase
    .from("property_settings")
    .select("name, address, phone")
    .limit(1)
    .maybeSingle();

  const { data: accts } = await supabase
    .from("payment_accounts")
    .select("id, bank_name, account_name, account_number, active, qr_image_url")
    .order("created_at", { ascending: true });

  const accounts: AccountRow[] = (accts ?? []).map((a) => ({
    id: a.id as string,
    bank_name: a.bank_name as string,
    account_name: a.account_name as string,
    account_number: a.account_number as string,
    active: a.active as boolean,
    qrUrl: a.qr_image_url
      ? supabase.storage.from(QR_BUCKET).getPublicUrl(a.qr_image_url as string)
          .data.publicUrl
      : null,
  }));

  const t = await getTranslations("settings");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <PropertyForm
        name={prop?.name ?? ""}
        address={prop?.address ?? null}
        phone={prop?.phone ?? null}
      />
      <PaymentAccounts accounts={accounts} />
    </div>
  );
}
