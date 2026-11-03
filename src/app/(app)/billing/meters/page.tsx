import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { billingPeriod, monthToDate } from "@/lib/billing";
import { MetersGrid, type MeterRow } from "@/components/billing/meters-grid";

export default async function MetersPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireModule("billing");
  const supabase = await createClient();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : billingPeriod();
  const billing_month = monthToDate(month);

  const { data } = await supabase
    .from("bills")
    .select(
      "id, room_number, payer_name, water_billing_mode, water_start, water_end, elec_start, elec_end, elec_is_manual, meter_digits"
    )
    .eq("billing_month", billing_month)
    .eq("status", "DRAFT");

  const raw = (data ?? []) as unknown as Array<{
    id: string;
    room_number: string;
    payer_name: string;
    water_billing_mode: string;
    water_start: string;
    water_end: string;
    elec_start: string;
    elec_end: string;
    elec_is_manual: boolean;
    meter_digits: number;
  }>;

  const rows: MeterRow[] = raw
    .map((b) => ({
      billId: b.id,
      room: b.room_number,
      payer: b.payer_name,
      waterMode: b.water_billing_mode,
      waterStart: Number(b.water_start),
      waterEnd: Number(b.water_end),
      elecStart: Number(b.elec_start),
      elecEnd: Number(b.elec_end),
      elecManual: b.elec_is_manual,
      digits: Number(b.meter_digits),
    }))
    .sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }));

  const t = await getTranslations("billing");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("meters.title")}
        </h1>
        <Link
          href={`/billing?month=${month}`}
          className="text-sm text-primary hover:underline"
        >
          ← {t("title")}
        </Link>
      </div>
      <MetersGrid month={month} rows={rows} />
    </div>
  );
}
