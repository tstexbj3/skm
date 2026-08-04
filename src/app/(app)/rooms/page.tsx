import { getTranslations } from "next-intl/server";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STATUS_DOT, DEFAULT_WATER_PERSON_RATE, type Room } from "@/lib/rooms";
import { RoomsBoard } from "@/components/rooms/rooms-board";
import { UtilityRatesSetting } from "@/components/rooms/utility-rates-setting";
import { cn } from "@/lib/utils";

export default async function RoomsPage() {
  const ctx = await requireModule("rooms");
  const supabase = await createClient();

  const { data } = await supabase
    .from("rooms")
    .select(
      "id, room_number, floor, room_kind, rent_rate, water_billing_mode, water_rate, occupant_count, status, note"
    )
    .order("floor", { ascending: true })
    .order("room_number", { ascending: true });

  const rooms = (data ?? []) as Room[];

  const { data: rateRow } = await supabase
    .from("utility_rates")
    .select(
      "water_person_rate, electricity_unit_rate, electricity_min_charge, meter_digits"
    )
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const waterPersonRate =
    rateRow?.water_person_rate != null
      ? Number(rateRow.water_person_rate)
      : DEFAULT_WATER_PERSON_RATE;
  const electricityUnitRate =
    rateRow?.electricity_unit_rate != null
      ? Number(rateRow.electricity_unit_rate)
      : 0;
  const electricityMinCharge =
    rateRow?.electricity_min_charge != null
      ? Number(rateRow.electricity_min_charge)
      : 200;
  const meterDigits =
    rateRow?.meter_digits != null ? Number(rateRow.meter_digits) : 0;

  const t = await getTranslations("rooms");

  const total = rooms.length;
  const occupied = rooms.filter((r) => r.status === "OCCUPIED").length;
  const vacant = rooms.filter((r) => r.status === "VACANT").length;
  const pending = rooms.filter((r) => r.status === "PENDING_MOVEOUT").length;
  const rate = total ? Math.round((occupied / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Stat label={t("occupancy")} value={`${rate}%`} />
        <Stat label={t("totalRooms")} value={total} />
        <Stat label={t("statuses.OCCUPIED")} value={occupied} dot="OCCUPIED" />
        <Stat label={t("statuses.VACANT")} value={vacant} dot="VACANT" />
        <Stat
          label={t("statuses.PENDING_MOVEOUT")}
          value={pending}
          dot="PENDING_MOVEOUT"
        />
      </div>

      <UtilityRatesSetting
        waterPersonRate={waterPersonRate}
        electricityUnitRate={electricityUnitRate}
        electricityMinCharge={electricityMinCharge}
        meterDigits={meterDigits}
        isOwner={ctx.isOwner}
      />

      <RoomsBoard
        rooms={rooms}
        isOwner={ctx.isOwner}
        waterPersonRate={waterPersonRate}
      />
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
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {dot && (
          <span className={cn("size-2.5 rounded-full", STATUS_DOT[dot])} />
        )}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
