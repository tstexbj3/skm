import { getTranslations } from "next-intl/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/supabase/storage";
import { QR_BUCKET, PAYMENT_SLIPS_BUCKET } from "@/lib/buckets";
import { PropertyForm } from "@/components/settings/property-form";
import {
  PaymentAccounts,
  type AccountRow,
} from "@/components/settings/payment-accounts";
import {
  LineAccounts,
  type LineAccountRow,
  type RoomOption,
} from "@/components/settings/line-accounts";
import {
  PendingSlips,
  type PendingSlipRow,
} from "@/components/settings/pending-slips";

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

  // Slips from unknown LINE accounts, awaiting an admin to assign a room.
  const { data: pendingData } = await supabase
    .from("line_pending_slips")
    .select("id, display_name, amount, sender_name, bank, image_path, created_at")
    .eq("status", "PENDING")
    .order("created_at", { ascending: false });
  const pendingSlips: PendingSlipRow[] = await Promise.all(
    (pendingData ?? []).map(async (p) => ({
      id: p.id as string,
      displayName: (p.display_name as string) ?? "",
      amount: String(p.amount),
      sender: (p.sender_name as string) ?? "",
      bank: (p.bank as string) ?? "",
      slipUrl: await signedUrl(PAYMENT_SLIPS_BUCKET, p.image_path as string | null),
      date: String(p.created_at).slice(0, 10),
    }))
  );

  // LINE accounts already linked to a room (managed below).
  const { data: lineRows } = await supabase
    .from("line_user_rooms")
    .select("user_id, display_name, room, updated_at")
    .not("room", "is", null)
    .order("updated_at", { ascending: false });
  const lineAccounts: LineAccountRow[] = (lineRows ?? []).map((r) => ({
    userId: r.user_id as string,
    displayName: (r.display_name as string) ?? "",
    room: (r.room as string | null) ?? null,
  }));

  const { data: activeContracts } = await supabase
    .from("contracts")
    .select("room:rooms(room_number), tenant:tenants(full_name)")
    .eq("status", "ACTIVE");
  const roomOptions: RoomOption[] = (
    (activeContracts ?? []) as unknown as Array<{
      room: { room_number: string } | null;
      tenant: { full_name: string } | null;
    }>
  )
    .filter((c) => c.room)
    .map((c) => ({
      room: c.room!.room_number,
      label: `${c.room!.room_number} — ${c.tenant?.full_name ?? ""}`,
    }))
    .sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }));

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
      <PendingSlips slips={pendingSlips} rooms={roomOptions} />
      <LineAccounts accounts={lineAccounts} rooms={roomOptions} />
    </div>
  );
}
