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

      {rooms.length === 0 ? (
        <p className="text-muted-foreground">{t("noVacant")}</p>
      ) : (
        <SignTenantForm rooms={rooms} />
      )}
    </div>
  );
}
