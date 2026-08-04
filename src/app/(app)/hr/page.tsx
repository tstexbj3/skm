import { getTranslations } from "next-intl/server";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StaffManager, type Staff } from "@/components/hr/staff-manager";

export default async function HrPage() {
  await requireOwner();
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_members")
    .select("id, full_name, position, monthly_salary, active")
    .order("created_at", { ascending: true });
  const staff = (data ?? []) as unknown as Staff[];
  const t = await getTranslations("hr");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <StaffManager staff={staff} />
    </div>
  );
}
