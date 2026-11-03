import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  BellRing,
  CalendarClock,
  ChevronRight,
  DoorClosed,
  FileText,
  Gauge,
  LogOut,
  MessageSquareText,
  Receipt,
  UserPlus,
  Wallet,
} from "lucide-react";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { contractExpiry, EXPIRY_BADGE } from "@/lib/contracts";
import { billingPeriod, formatMoney2, n } from "@/lib/billing";
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

  const period = billingPeriod();
  const monthDate = `${period}-01`;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);

  const countOf = (res: { count: number | null }) => res.count ?? 0;

  const [
    roomsRes,
    billsRes,
    expiringRes,
    sentRes,
    recordedRes,
    pendExpRes,
    moveoutRes,
    slipsRes,
  ] = await Promise.all([
      supabase.from("rooms").select("status"),
      supabase
        .from("bills")
        .select("id, total_amount, status")
        .eq("billing_month", monthDate),
      supabase
        .from("contracts")
        .select(
          "id, end_date, tenant:tenants(id, full_name), room:rooms(room_number)"
        )
        .eq("status", "ACTIVE")
        .not("end_date", "is", null)
        .lte("end_date", cutoff.toISOString().slice(0, 10))
        .order("end_date", { ascending: true }),
      // Approval queues (owner cards). Staff-readable, cheap head counts.
      supabase
        .from("bills")
        .select("id", { count: "exact", head: true })
        .eq("status", "SENT"),
      supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("status", "RECORDED"),
      supabase
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("status", "PENDING_APPROVAL"),
      supabase
        .from("move_outs")
        .select("id", { count: "exact", head: true })
        .eq("status", "NOTIFIED"),
      supabase
        .from("line_pending_slips")
        .select("id", { count: "exact", head: true })
        .eq("status", "PENDING"),
    ]);

  const rooms = (roomsRes.data ?? []) as Array<{ status: string }>;
  const occupied = rooms.filter((r) => r.status === "OCCUPIED").length;
  const vacant = rooms.filter((r) => r.status === "VACANT").length;

  const bills = (billsRes.data ?? []) as Array<{
    id: string;
    total_amount: string;
    status: string;
  }>;
  const drafts = bills.filter((b) => b.status === "DRAFT").length;
  const issued = bills.filter((b) => b.status !== "DRAFT");

  // Outstanding this month = issued bill totals minus approved payments.
  let outstandingCount = 0;
  let outstandingSum = 0;
  if (issued.length > 0) {
    const { data: pays } = await supabase
      .from("payments")
      .select("bill_id, amount")
      .in(
        "bill_id",
        issued.map((b) => b.id)
      )
      .in("status", ["APPROVED", "RECONCILED"]);
    const paidBy = new Map<string, number>();
    for (const p of pays ?? []) {
      paidBy.set(p.bill_id, (paidBy.get(p.bill_id) ?? 0) + n(p.amount));
    }
    for (const b of issued) {
      const out = n(b.total_amount) - (paidBy.get(b.id) ?? 0);
      if (out > 0.009) {
        outstandingCount += 1;
        outstandingSum += out;
      }
    }
  }

  const expiring = (expiringRes.data ?? []) as unknown as ExpiringRow[];

  const pending = [
    { key: "pendingSlips", href: "/line-slips", icon: MessageSquareText, count: countOf(slipsRes) },
    { key: "pendingBills", href: "/billing", icon: FileText, count: countOf(sentRes) },
    { key: "pendingPayments", href: "/payments", icon: Wallet, count: countOf(recordedRes) },
    { key: "pendingExpenses", href: "/expenses", icon: Receipt, count: countOf(pendExpRes) },
    { key: "pendingMoveouts", href: "/moveouts", icon: LogOut, count: countOf(moveoutRes) },
  ];
  const pendingTotal = pending.reduce((s, p) => s + p.count, 0);

  const t = await getTranslations("dashboard");
  const tt = await getTranslations("tenants");

  const can = (m: "rooms" | "tenants" | "billing") =>
    ctx.isOwner || ctx.permissions[m];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("title")}, {ctx.profile.full_name}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Owner: what's waiting for approval — tap a card to go handle it. */}
      {ctx.isOwner && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <BellRing
              className={cn(
                "size-4",
                pendingTotal > 0 ? "text-amber-500" : "text-muted-foreground"
              )}
            />
            {t("pendingTitle")}
            {pendingTotal === 0 && (
              <span className="font-normal">· {t("allClear")}</span>
            )}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {pending.map(({ key, href, icon: Icon, count }) => (
              <Link key={key} href={href} className="group">
                <Card
                  className={cn(
                    "h-full transition-colors group-hover:bg-accent",
                    count > 0 && "border-amber-400/60"
                  )}
                >
                  <CardContent className="flex items-center justify-between gap-2 p-4">
                    <div>
                      <div className="text-2xl font-semibold tabular-nums">
                        {count}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t(key)}
                      </div>
                    </div>
                    <Icon
                      className={cn(
                        "size-5 shrink-0",
                        count > 0 ? "text-amber-500" : "text-muted-foreground/50"
                      )}
                    />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* This month at a glance. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {can("rooms") && (
          <StatTile
            href="/rooms"
            icon={DoorClosed}
            label={t("tileRooms")}
            value={`${occupied}/${rooms.length}`}
            sub={t("tileRoomsSub", { vacant })}
          />
        )}
        {can("billing") && (
          <StatTile
            href="/billing"
            icon={FileText}
            label={`${t("tileBills")} · ${period}`}
            value={`${issued.length}`}
            sub={t("tileBillsSub", { drafts })}
          />
        )}
        {can("billing") && (
          <StatTile
            href="/billing"
            icon={Wallet}
            label={`${t("tileOutstanding")} · ${period}`}
            value={`฿${formatMoney2(outstandingSum)}`}
            sub={t("tileOutstandingSub", { count: outstandingCount })}
          />
        )}
      </div>

      {/* Shortcuts to the most common tasks. */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("quickTitle")}
        </h2>
        <div className="flex flex-wrap gap-2">
          {can("tenants") && (
            <QuickAction
              href="/tenants/new"
              icon={UserPlus}
              label={t("actionNewTenant")}
            />
          )}
          {can("billing") && (
            <QuickAction
              href="/billing/meters"
              icon={Gauge}
              label={t("actionMeters")}
            />
          )}
          {can("billing") && (
            <QuickAction
              href="/billing"
              icon={FileText}
              label={t("actionBilling")}
            />
          )}
        </div>
      </section>

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

function StatTile({
  href,
  icon: Icon,
  label,
  value,
  sub,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-colors group-hover:bg-accent">
        <CardContent className="flex items-center justify-between gap-2 p-4">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-xl font-semibold tabular-nums">{value}</div>
            <div className="text-xs text-muted-foreground">{sub}</div>
          </div>
          <Icon className="size-5 shrink-0 text-muted-foreground/50" />
        </CardContent>
      </Card>
    </Link>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent"
    >
      <Icon className="size-4" />
      {label}
      <ChevronRight className="size-3.5 text-muted-foreground" />
    </Link>
  );
}
