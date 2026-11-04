import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SignTenantForm } from "@/components/tenants/sign-tenant-form";

export default async function NewTenantPage() {
  await requireModule("tenants");
  const supabase = await createClient();
  const { data } = await supabase
    .from("rooms")
    .select("id, room_number, floor, rent_rate")
    .eq("status", "VACANT")
    .order("floor", { ascending: true })
    .order("room_number", { ascending: true });
  const rooms = data ?? [];
  // Rooms whose move-out is not completed yet: not signable, but worth
  // pointing at so "no vacant rooms" is actionable instead of a dead end.
  const { data: pendingData } = await supabase
    .from("rooms")
    .select("room_number")
    .eq("status", "PENDING_MOVEOUT")
    .order("room_number", { ascending: true });
  const pendingRooms = (pendingData ?? []).map((r) => r.room_number as string);
  const t = await getTranslations("tenants");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/tenants"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("signTitle")}
        </h1>
      </div>

      {pendingRooms.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/40">
          <p>{t("pendingMoveoutHint", { rooms: pendingRooms.join(", ") })}</p>
          <Link
            href="/moveouts"
            className="mt-1 inline-block font-medium text-primary hover:underline"
          >
            {t("goToMoveouts")} →
          </Link>
        </div>
      )}

      {rooms.length === 0 ? (
        <p className="text-muted-foreground">{t("noVacant")}</p>
      ) : (
        <SignTenantForm rooms={rooms} />
      )}
    </div>
  );
}
