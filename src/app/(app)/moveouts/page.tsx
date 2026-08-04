import { getTranslations } from "next-intl/server";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  MoveoutBoard,
  type ActiveContract,
  type Moveout,
} from "@/components/moveouts/moveout-board";

export default async function MoveoutsPage() {
  const ctx = await requireModule("moveouts");
  const supabase = await createClient();
  const t = await getTranslations("moveouts");

  const { data: moData } = await supabase
    .from("move_outs")
    .select(
      "id, notice_date, move_out_date, notice_days, red_flag_no_refund, status, damage_deposit_snapshot, damage_deductions, damage_deposit_refund, last_month_rent, contract:contracts(id, tenant:tenants(full_name), room:rooms(room_number))"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const moRaw = (moData ?? []) as unknown as Array<
    Omit<Moveout, "room" | "tenant"> & {
      contract: {
        id: string;
        tenant: { full_name: string } | null;
        room: { room_number: string } | null;
      } | null;
    }
  >;
  const moveouts: Moveout[] = moRaw.map((m) => ({
    id: m.id,
    room: m.contract?.room?.room_number ?? "—",
    tenant: m.contract?.tenant?.full_name ?? "—",
    notice_date: m.notice_date,
    move_out_date: m.move_out_date,
    notice_days: m.notice_days,
    red_flag_no_refund: m.red_flag_no_refund,
    status: m.status,
    damage_deposit_snapshot: String(m.damage_deposit_snapshot),
    damage_deductions: String(m.damage_deductions),
    damage_deposit_refund: String(m.damage_deposit_refund),
    last_month_rent: String(m.last_month_rent),
  }));

  const inProgress = new Set(
    moRaw
      .filter((m) => m.status === "NOTIFIED" || m.status === "APPROVED")
      .map((m) => m.contract?.id)
      .filter(Boolean) as string[]
  );

  const { data: cData } = await supabase
    .from("contracts")
    .select("id, room:rooms(room_number), tenant:tenants(full_name)")
    .eq("status", "ACTIVE");
  const cRaw = (cData ?? []) as unknown as Array<{
    id: string;
    room: { room_number: string } | null;
    tenant: { full_name: string } | null;
  }>;
  const contracts: ActiveContract[] = cRaw
    .filter((c) => !inProgress.has(c.id))
    .map((c) => ({
      id: c.id,
      label: `${c.room?.room_number ?? "—"} · ${c.tenant?.full_name ?? "—"}`,
    }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <MoveoutBoard
        contracts={contracts}
        moveouts={moveouts}
        isOwner={ctx.isOwner}
      />
    </div>
  );
}
