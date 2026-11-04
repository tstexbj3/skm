import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/rooms";
import type { TenancyRow } from "@/lib/tenants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const ctx = await requireModule("tenants");
  const supabase = await createClient();
  // Past/ended tenancies are owner-only — admins can't see the tab or the data,
  // even by visiting ?view=past directly.
  const requested = (await searchParams).view === "past" ? "past" : "current";
  const view = requested === "past" && ctx.isOwner ? "past" : "current";
  const status = view === "past" ? "ENDED" : "ACTIVE";

  const { data } = await supabase
    .from("contracts")
    .select(
      "id, occupant_count, start_date, end_date, advance_rent_amount, damage_deposit_amount, tenant:tenants(id, full_name, phone), room:rooms(room_number, floor)"
    )
    .eq("status", status)
    .order(view === "past" ? "end_date" : "start_date", { ascending: false });

  const tenancies = (data ?? []) as unknown as TenancyRow[];
  if (view === "current") {
    // Current tab reads like the building: room numbers, lowest first.
    tenancies.sort((a, b) =>
      (a.room?.room_number ?? "").localeCompare(b.room?.room_number ?? "", undefined, {
        numeric: true,
      })
    );
  }
  const t = await getTranslations("tenants");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <Button asChild size="sm">
          <Link href="/tenants/new">
            <UserPlus className="size-4" />
            {t("signNew")}
          </Link>
        </Button>
      </div>

      {ctx.isOwner && (
        <div className="flex gap-1 border-b">
          <Tab href="/tenants" active={view === "current"}>
            {t("currentTab")}
          </Tab>
          <Tab href="/tenants?view=past" active={view === "past"}>
            {t("pastTab")}
          </Tab>
        </div>
      )}

      {tenancies.length === 0 ? (
        <p className="text-muted-foreground">
          {view === "past" ? t("emptyPast") : t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{t("room")}</th>
                <th className="px-4 py-2 font-medium">{t("fullName")}</th>
                <th className="px-4 py-2 font-medium">{t("phone")}</th>
                <th className="px-4 py-2 font-medium">{t("startDate")}</th>
                <th className="px-4 py-2 font-medium">{t("endDate")}</th>
                <th className="px-4 py-2 font-medium">{t("deposit")}</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {tenancies.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-2 font-medium">
                    {row.room?.room_number ?? "—"}
                  </td>
                  <td className="px-4 py-2">{row.tenant?.full_name ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.tenant?.phone ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.start_date}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.end_date ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    ฿{formatMoney(row.damage_deposit_amount)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {row.tenant && (
                      <Link
                        href={`/tenants/${row.tenant.id}`}
                        className="text-primary hover:underline"
                      >
                        {t("view")}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
