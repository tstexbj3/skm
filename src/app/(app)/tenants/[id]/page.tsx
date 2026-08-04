import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/supabase/storage";
import { formatMoney } from "@/lib/rooms";
import { TENANT_BUCKET, type Tenant } from "@/lib/tenants";
import { contractExpiry, EXPIRY_BADGE } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { TenantEditDialog } from "@/components/tenants/tenant-edit-dialog";
import { AddCoTenantDialog } from "@/components/tenants/add-co-tenant-dialog";
import { PurgeTenantDialog } from "@/components/tenants/purge-tenant-dialog";
import { ContractActions } from "@/components/tenants/contract-actions";
import {
  RecurringCharges,
  type RecurringItem,
} from "@/components/tenants/recurring-charges";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FIELD_LABEL: Record<string, string> = {
  full_name: "fullName",
  phone: "phone",
  co_tenant_name: "coTenantName",
  photo_url: "photo",
  national_id_image_url: "nationalId",
  co_tenant_national_id_image_url: "coTenantId",
};
const URL_FIELDS = new Set([
  "photo_url",
  "national_id_image_url",
  "co_tenant_national_id_image_url",
]);

type AuditLog = {
  id: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  changed_at: string;
  actor: { full_name: string } | null;
};

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireModule("tenants");
  const { id } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", id)
    .single<Tenant>();
  if (!tenant) notFound();

  const { data: contractsData } = await supabase
    .from("contracts")
    .select("*, room:rooms(room_number, floor)")
    .eq("tenant_id", id)
    .order("created_at", { ascending: false });
  const contracts = contractsData ?? [];
  const contract =
    contracts.find((c) => c.status === "ACTIVE") ?? contracts[0] ?? null;
  const history = contracts.filter((c) => c.id !== contract?.id);

  const [photo, natId, coId, scan] = await Promise.all([
    signedUrl(TENANT_BUCKET, tenant.photo_url),
    signedUrl(TENANT_BUCKET, tenant.national_id_image_url),
    signedUrl(TENANT_BUCKET, tenant.co_tenant_national_id_image_url),
    signedUrl(TENANT_BUCKET, contract?.contract_scan_url),
  ]);
  const historyScans = await Promise.all(
    history.map((h) => signedUrl(TENANT_BUCKET, h.contract_scan_url))
  );

  const { data: recurringData } = contract?.id
    ? await supabase
        .from("recurring_charges")
        .select("id, label, amount")
        .eq("contract_id", contract.id)
        .eq("active", true)
        .order("created_at", { ascending: true })
    : { data: [] };
  const recurring = (recurringData ?? []) as RecurringItem[];

  const { data: logsData } = await supabase
    .from("audit_logs")
    .select("id, changes, changed_at, actor:profiles(full_name)")
    .eq("table_name", "tenants")
    .eq("record_id", id)
    .order("changed_at", { ascending: false });
  const logs = (logsData ?? []) as unknown as AuditLog[];

  const t = await getTranslations("tenants");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/tenants"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("backToList")}
      </Link>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={tenant.full_name}
              className="size-16 rounded-full border object-cover"
            />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-full border bg-muted text-xl font-semibold text-muted-foreground">
              {tenant.full_name.slice(0, 1)}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {tenant.full_name}
            </h1>
            <p className="text-muted-foreground">{tenant.phone ?? "—"}</p>
          </div>
        </div>
        {ctx.isOwner ? (
          <div className="flex flex-wrap justify-end gap-2">
            <TenantEditDialog
              tenant={{
                id: tenant.id,
                full_name: tenant.full_name,
                phone: tenant.phone,
                co_tenant_name: tenant.co_tenant_name,
              }}
            />
            <PurgeTenantDialog
              tenantId={tenant.id}
              tenantName={tenant.full_name}
            />
          </div>
        ) : !tenant.co_tenant_name ? (
          <AddCoTenantDialog tenantId={tenant.id} />
        ) : null}
      </div>

      {contract && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("tenancy")}</CardTitle>
            {ctx.isOwner && contract.status === "ACTIVE" && (
              <ContractActions contractId={contract.id} tenantId={tenant.id} />
            )}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label={t("room")}>
              {contract.room?.room_number ?? "—"}
            </Field>
            <Field label={t("startDate")}>{contract.start_date}</Field>
            <Field label={t("termMonths")}>
              {contract.term_months
                ? t("monthsValue", { n: contract.term_months })
                : "—"}
            </Field>
            <Field label={t("endDate")}>
              {contract.end_date ? (
                <span className="flex items-center gap-2">
                  {contract.end_date}
                  {(() => {
                    const e = contractExpiry(contract.end_date);
                    if (e.state === "ok" || e.state === "none") return null;
                    return (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-xs",
                          EXPIRY_BADGE[e.state]
                        )}
                      >
                        {e.state === "expired"
                          ? t("expired")
                          : t("daysLeft", { n: e.days ?? 0 })}
                      </span>
                    );
                  })()}
                </span>
              ) : (
                "—"
              )}
            </Field>
            <Field label={t("occupants")}>{contract.occupant_count}</Field>
            <Field label={t("coTenantName")}>
              {tenant.co_tenant_name ?? "—"}
            </Field>
            <Field label={t("advanceAmount")}>
              ฿{formatMoney(contract.advance_rent_paid)} / ฿
              {formatMoney(contract.advance_rent_amount)}
            </Field>
            <Field label={t("depositAmount")}>
              ฿{formatMoney(contract.damage_deposit_paid)} / ฿
              {formatMoney(contract.damage_deposit_amount)}
            </Field>
          </CardContent>
        </Card>
      )}

      {contract && contract.status === "ACTIVE" && (
        <RecurringCharges
          contractId={contract.id}
          tenantId={tenant.id}
          items={recurring}
          isOwner={ctx.isOwner}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("documents")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <DocLink label={t("nationalId")} href={natId} viewLabel={t("view")} />
          <DocLink label={t("coTenantId")} href={coId} viewLabel={t("view")} />
          <DocLink
            label={t("contractScan")}
            href={scan}
            viewLabel={t("view")}
          />
          <DocLink label={t("photo")} href={photo} viewLabel={t("view")} />
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("contractHistory")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((h, i) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">
                    {h.start_date} – {h.end_date ?? "—"}
                  </span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {h.term_months ? t("monthsValue", { n: h.term_months }) : "—"}
                    {" · "}
                    {t(`status.${h.status}`)}
                  </span>
                </div>
                {historyScans[i] ? (
                  <a
                    href={historyScans[i] as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-primary hover:underline"
                  >
                    {t("view")}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("history")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {logs.map((log) => (
              <div key={log.id} className="border-l-2 pl-3">
                <div className="text-xs text-muted-foreground">
                  {log.changed_at.slice(0, 16).replace("T", " ")}
                  {log.actor?.full_name ? ` · ${log.actor.full_name}` : ""}
                </div>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {Object.entries(log.changes).map(([field, val]) => (
                    <li key={field}>
                      <span className="text-muted-foreground">
                        {FIELD_LABEL[field] ? t(FIELD_LABEL[field]) : field}:
                      </span>{" "}
                      {URL_FIELDS.has(field) ? (
                        t("fileChanged")
                      ) : (
                        <>
                          {String(val.old ?? "—")} → {String(val.new ?? "—")}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}

function DocLink({
  label,
  href,
  viewLabel,
}: {
  label: string;
  href: string | null;
  viewLabel: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span className="flex items-center gap-2 text-sm">
        <FileText className="size-4 text-muted-foreground" />
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline"
        >
          {viewLabel}
        </a>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}
