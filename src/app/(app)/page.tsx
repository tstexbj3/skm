import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarClock } from "lucide-react";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { contractExpiry, EXPIRY_BADGE } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ExpiringRow = {
  id: string;
  end_date: string;
  tenant: { id: string; full_name: string } | null;
  room: { room_number: string } | null;
};

export default async function DashboardPage() {
  const ctx = await getSessionContext();
  const supabase = await createClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);
  const { data } = await supabase
    .from("contracts")
    .select("id, end_date, tenant:tenants(id, full_name), room:rooms(room_number)")
    .eq("status", "ACTIVE")
    .not("end_date", "is", null)
    .lte("end_date", cutoff.toISOString().slice(0, 10))
    .order("end_date", { ascending: true });
  const expiring = (data ?? []) as unknown as ExpiringRow[];

  const t = await getTranslations("dashboard");
  const tr = await getTranslations("roles");
  const tt = await getTranslations("tenants");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("title")}, {ctx.profile.full_name}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card className="max-w-sm">
        <CardHeader>
          <CardDescription>{t("loggedInAs")}</CardDescription>
          <CardTitle>{tr(ctx.profile.role)}</CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4 text-amber-500" />
            {t("expiringTitle")}
          </CardTitle>
          <CardDescription>{t("expiringSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {expiring.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("expiringEmpty")}</p>
          ) : (
            <ul className="divide-y">
              {expiring.map((row) => {
                const e = contractExpiry(row.end_date);
                const badge = e.state === "none" ? "ok" : e.state;
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">
                        {tt("room")} {row.room?.room_number ?? "—"}
                      </span>
                      <span className="text-muted-foreground">
                        {" · "}
                        {row.tenant?.full_name ?? "—"} · {row.end_date}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-xs",
                          EXPIRY_BADGE[badge]
                        )}
                      >
                        {e.state === "expired"
                          ? tt("expired")
                          : tt("daysLeft", { n: e.days ?? 0 })}
                      </span>
                      {row.tenant && (
                        <Link
                          href={`/tenants/${row.tenant.id}`}
                          className="text-primary hover:underline"
                        >
                          {tt("view")}
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
