"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TENANT_BUCKET } from "@/lib/tenants";
import { addMonths } from "@/lib/contracts";

export type SignState = { error?: string };

function money(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Sign a tenant into a vacant room: upload documents, create the tenant, then
 * the ACTIVE contract. A DB trigger flips the room to OCCUPIED and copies the
 * occupant count. Images are stored as bucket paths (private; signed on read).
 */
export async function signTenant(
  _prev: SignState,
  formData: FormData
): Promise<SignState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const room_id = String(formData.get("room_id") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!room_id) return { error: "room_required" };
  if (!full_name) return { error: "name_required" };

  // Files were uploaded client-side to Storage; we receive their paths.
  const photo_url = String(formData.get("photo") ?? "") || null;
  const national_id_image_url =
    String(formData.get("national_id") ?? "") || null;
  const co_tenant_national_id_image_url =
    String(formData.get("co_tenant_national_id") ?? "") || null;
  const contract_scan_url =
    String(formData.get("contract_scan") ?? "") || null;

  const { data: tenant, error: tErr } = await supabase
    .from("tenants")
    .insert({
      full_name,
      phone: String(formData.get("phone") ?? "").trim() || null,
      photo_url,
      national_id_image_url,
      co_tenant_name: String(formData.get("co_tenant_name") ?? "").trim() || null,
      co_tenant_national_id_image_url,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (tErr || !tenant) return { error: tErr?.message ?? "tenant_failed" };

  const occupantRaw = Number(formData.get("occupant_count"));
  const occupant_count =
    Number.isInteger(occupantRaw) && occupantRaw > 0 ? occupantRaw : 1;
  const start_date =
    String(formData.get("start_date") ?? "") ||
    new Date().toISOString().slice(0, 10);

  const termRaw = Number(formData.get("term_months"));
  const term_months =
    Number.isInteger(termRaw) && termRaw > 0 ? termRaw : 12;
  const end_date = addMonths(start_date, term_months);

  const { error: cErr } = await supabase.from("contracts").insert({
    tenant_id: tenant.id,
    room_id,
    contract_scan_url,
    occupant_count,
    advance_rent_amount: money(formData.get("advance_rent_amount")),
    advance_rent_paid: money(formData.get("advance_rent_paid")),
    damage_deposit_amount: money(formData.get("damage_deposit_amount")),
    damage_deposit_paid: money(formData.get("damage_deposit_paid")),
    start_date,
    term_months,
    end_date,
    status: "ACTIVE",
    created_by: user.id,
  });

  if (cErr) {
    // 23505 = unique_violation on the one-active-contract-per-room index
    if (cErr.code === "23505") return { error: "room_taken" };
    return { error: cErr.message };
  }

  revalidatePath("/tenants");
  revalidatePath("/rooms");
  redirect(`/tenants/${tenant.id}`);
}

export type CoTenantState = { error?: string; ok?: boolean };

/**
 * Add a co-tenant to an existing tenant. Available to ADMIN (add-only) and
 * OWNER, via the add_co_tenant() SECURITY DEFINER function so only the two
 * co-tenant columns are written. Logged to audit_logs.
 */
export async function addCoTenant(
  _prev: CoTenantState,
  formData: FormData
): Promise<CoTenantState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("tenant_id") ?? "");
  if (!id) return { error: "missing_id" };
  const name = String(formData.get("co_tenant_name") ?? "").trim();
  if (!name) return { error: "name_required" };

  const { data: cur } = await supabase
    .from("tenants")
    .select("co_tenant_name, co_tenant_national_id_image_url")
    .eq("id", id)
    .single<{
      co_tenant_name: string | null;
      co_tenant_national_id_image_url: string | null;
    }>();

  const imagePath =
    String(formData.get("co_tenant_national_id") ?? "") || null;

  const { error } = await supabase.rpc("add_co_tenant", {
    p_tenant_id: id,
    p_name: name,
    p_image_url: imagePath,
  });
  if (error) {
    if (error.message.includes("co_tenant_exists"))
      return { error: "co_tenant_exists" };
    if (error.message.includes("not_authorized")) return { error: "auth" };
    return { error: error.message };
  }

  await supabase.from("audit_logs").insert({
    table_name: "tenants",
    record_id: id,
    action: "ADD_CO_TENANT",
    changes: {
      co_tenant_name: { old: cur?.co_tenant_name ?? null, new: name },
      ...(imagePath
        ? {
            co_tenant_national_id_image_url: {
              old: cur?.co_tenant_national_id_image_url ?? null,
              new: imagePath,
            },
          }
        : {}),
    },
    changed_by: user.id,
  });

  revalidatePath(`/tenants/${id}`);
  return { ok: true };
}

export type TenantEditState = { error?: string; ok?: boolean };

type TenantEditable = {
  full_name: string;
  phone: string | null;
  co_tenant_name: string | null;
  photo_url: string | null;
  national_id_image_url: string | null;
  co_tenant_national_id_image_url: string | null;
};

/**
 * Owner edit of tenant info. Any newly-uploaded image replaces the old one;
 * a field-level diff (old -> new) is written to audit_logs. Owner-only via RLS.
 */
export async function updateTenant(
  _prev: TenantEditState,
  formData: FormData
): Promise<TenantEditState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "missing_id" };

  const { data: current } = await supabase
    .from("tenants")
    .select(
      "full_name, phone, co_tenant_name, photo_url, national_id_image_url, co_tenant_national_id_image_url"
    )
    .eq("id", id)
    .single<TenantEditable>();
  if (!current) return { error: "not_found" };

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "name_required" };

  // New files (if any) were uploaded client-side; empty means keep current.
  const newPhoto = String(formData.get("photo") ?? "") || null;
  const newNatId = String(formData.get("national_id") ?? "") || null;
  const newCoId = String(formData.get("co_tenant_national_id") ?? "") || null;

  const next: TenantEditable = {
    full_name,
    phone: String(formData.get("phone") ?? "").trim() || null,
    co_tenant_name: String(formData.get("co_tenant_name") ?? "").trim() || null,
    photo_url: newPhoto ?? current.photo_url,
    national_id_image_url: newNatId ?? current.national_id_image_url,
    co_tenant_national_id_image_url:
      newCoId ?? current.co_tenant_national_id_image_url,
  };

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(next) as (keyof TenantEditable)[]) {
    const oldV = current[key] ?? null;
    const newV = next[key] ?? null;
    if (String(oldV ?? "") !== String(newV ?? "")) {
      changes[key] = { old: oldV, new: newV };
    }
  }

  if (Object.keys(changes).length === 0) return { ok: true };

  const { error: uErr } = await supabase
    .from("tenants")
    .update(next)
    .eq("id", id);
  if (uErr) return { error: uErr.message };

  await supabase.from("audit_logs").insert({
    table_name: "tenants",
    record_id: id,
    action: "UPDATE",
    changes,
    changed_by: user.id,
  });

  // Remove replaced files so they don't linger as stale storage.
  const stale = [
    newPhoto && current.photo_url && current.photo_url !== newPhoto
      ? current.photo_url
      : null,
    newNatId &&
    current.national_id_image_url &&
    current.national_id_image_url !== newNatId
      ? current.national_id_image_url
      : null,
    newCoId &&
    current.co_tenant_national_id_image_url &&
    current.co_tenant_national_id_image_url !== newCoId
      ? current.co_tenant_national_id_image_url
      : null,
  ].filter((p): p is string => Boolean(p));
  if (stale.length) {
    await supabase.storage.from(TENANT_BUCKET).remove(stale);
  }

  revalidatePath(`/tenants/${id}`);
  revalidatePath("/tenants");
  return { ok: true };
}

export type PurgeState = { error?: string; ok?: boolean };

/**
 * Permanently delete a tenant (owner-only). Removes contracts + audit + tenant
 * via purge_tenant() (which refuses if any bill exists), then deletes the
 * tenant's storage files, and records a deletion_logs entry. Irreversible.
 */
export async function purgeTenant(
  _prev: PurgeState,
  formData: FormData
): Promise<PurgeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("tenant_id") ?? "");
  if (!id) return { error: "missing_id" };
  const reason = String(formData.get("reason") ?? "").trim() || null;

  // Gather label + all storage paths BEFORE deleting the DB rows.
  const { data: tenant } = await supabase
    .from("tenants")
    .select(
      "full_name, photo_url, national_id_image_url, co_tenant_national_id_image_url"
    )
    .eq("id", id)
    .single<{
      full_name: string;
      photo_url: string | null;
      national_id_image_url: string | null;
      co_tenant_national_id_image_url: string | null;
    }>();
  const { data: contractsData } = await supabase
    .from("contracts")
    .select("contract_scan_url, room:rooms(room_number)")
    .eq("tenant_id", id);
  const cs = (contractsData ?? []) as unknown as Array<{
    contract_scan_url: string | null;
    room: { room_number: string } | null;
  }>;

  const referenced = [
    tenant?.photo_url,
    tenant?.national_id_image_url,
    tenant?.co_tenant_national_id_image_url,
    ...cs.map((c) => c.contract_scan_url),
  ].filter((p): p is string => Boolean(p));

  // Also anything left in the tenant's own folder (stale edit re-uploads).
  const { data: folder } = await supabase.storage
    .from(TENANT_BUCKET)
    .list(id);
  const folderPaths = (folder ?? []).map((f) => `${id}/${f.name}`);
  const paths = [...new Set([...referenced, ...folderPaths])];

  const rooms = cs
    .map((c) => c.room?.room_number)
    .filter(Boolean)
    .join(", ");
  const label = `${tenant?.full_name ?? id}${rooms ? ` (${rooms})` : ""}`;

  const { error } = await supabase.rpc("purge_tenant", { p_tenant_id: id });
  if (error) {
    if (error.message.includes("has_financials"))
      return { error: "has_financials" };
    if (error.message.includes("not_authorized")) return { error: "auth" };
    return { error: error.message };
  }

  if (paths.length) {
    await supabase.storage.from(TENANT_BUCKET).remove(paths);
  }
  await supabase.from("deletion_logs").insert({
    entity: "tenant",
    entity_label: label,
    reason,
    deleted_by: user.id,
  });

  revalidatePath("/tenants");
  revalidatePath("/rooms");
  redirect("/tenants");
}

export type ContractActionState = { error?: string; ok?: boolean };

type ContractSnapshot = {
  tenant_id: string;
  room_id: string;
  occupant_count: number;
  advance_rent_amount: string;
  advance_rent_paid: string;
  damage_deposit_amount: string;
  damage_deposit_paid: string;
  start_date: string;
  end_date: string | null;
  term_months: number | null;
  contract_scan_url: string | null;
};

/**
 * Renew a contract (owner): the OLD contract is archived (status RENEWED, kept
 * forever) and a NEW ACTIVE contract is created for the next term, linked back
 * via previous_contract_id. The new period starts when the old one ends. An
 * optional new scan is attached to the new contract. Both steps are logged.
 */
export async function renewContract(
  _prev: ContractActionState,
  formData: FormData
): Promise<ContractActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const contractId = String(formData.get("contract_id") ?? "");
  if (!contractId) return { error: "missing_id" };

  const { data: current } = await supabase
    .from("contracts")
    .select(
      "tenant_id, room_id, occupant_count, advance_rent_amount, advance_rent_paid, damage_deposit_amount, damage_deposit_paid, start_date, end_date, term_months, contract_scan_url"
    )
    .eq("id", contractId)
    .single<ContractSnapshot>();
  if (!current) return { error: "not_found" };

  const termRaw = Number(formData.get("term_months"));
  const term_months = Number.isInteger(termRaw) && termRaw > 0 ? termRaw : 12;

  const today = new Date().toISOString().slice(0, 10);
  const new_start =
    current.end_date && current.end_date > today ? current.end_date : today;
  const new_end = addMonths(new_start, term_months);

  const newScan = String(formData.get("contract_scan") ?? "") || null;

  // 1) Archive the old contract (kept, not deleted; not ENDED so room stays).
  const { error: archiveErr } = await supabase
    .from("contracts")
    .update({ status: "RENEWED" })
    .eq("id", contractId);
  if (archiveErr) return { error: archiveErr.message };

  // 2) Create the new ACTIVE contract for the next term.
  const { data: created, error: createErr } = await supabase
    .from("contracts")
    .insert({
      tenant_id: current.tenant_id,
      room_id: current.room_id,
      occupant_count: current.occupant_count,
      advance_rent_amount: current.advance_rent_amount,
      advance_rent_paid: current.advance_rent_paid,
      damage_deposit_amount: current.damage_deposit_amount,
      damage_deposit_paid: current.damage_deposit_paid,
      contract_scan_url: newScan ?? current.contract_scan_url,
      start_date: new_start,
      term_months,
      end_date: new_end,
      status: "ACTIVE",
      previous_contract_id: contractId,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (createErr || !created) {
    // best-effort rollback so the tenant isn't left with no active contract
    await supabase
      .from("contracts")
      .update({ status: "ACTIVE" })
      .eq("id", contractId);
    return { error: createErr?.message ?? "renew_failed" };
  }

  await supabase.from("audit_logs").insert([
    {
      table_name: "contracts",
      record_id: contractId,
      action: "RENEWED_OUT",
      changes: { status: { old: "ACTIVE", new: "RENEWED" } },
      changed_by: user.id,
    },
    {
      table_name: "contracts",
      record_id: created.id,
      action: "RENEW",
      changes: {
        previous_contract_id: { old: null, new: contractId },
        start_date: { old: current.start_date, new: new_start },
        end_date: { old: current.end_date, new: new_end },
        term_months: { old: current.term_months, new: term_months },
      },
      changed_by: user.id,
    },
  ]);

  revalidatePath(`/tenants/${current.tenant_id}`);
  revalidatePath("/tenants");
  return { ok: true };
}

/**
 * End a tenancy (owner): contract -> ENDED (a trigger frees the room). This is
 * how a renter is removed — records are never hard-deleted. Logged to audit_logs.
 */
export async function endTenancy(
  _prev: ContractActionState,
  formData: FormData
): Promise<ContractActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const contractId = String(formData.get("contract_id") ?? "");
  const tenantId = String(formData.get("tenant_id") ?? "");
  if (!contractId) return { error: "missing_id" };

  const { error } = await supabase
    .from("contracts")
    .update({ status: "ENDED" })
    .eq("id", contractId);
  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    table_name: "contracts",
    record_id: contractId,
    action: "END",
    changes: { status: { old: "ACTIVE", new: "ENDED" } },
    changed_by: user.id,
  });

  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/tenants");
  revalidatePath("/rooms");
  return { ok: true };
}

export type RecurringState = { error?: string; ok?: boolean };

/**
 * Add a recurring monthly charge (TV, fridge, ...) tied to the contract/renter.
 * These auto-apply to each generated bill. Requires the billing permission.
 */
export async function addRecurringCharge(
  _prev: RecurringState,
  formData: FormData
): Promise<RecurringState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const contract_id = String(formData.get("contract_id") ?? "");
  const tenant_id = String(formData.get("tenant_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const amount = money(formData.get("amount"));
  if (!contract_id || !label) return { error: "name_required" };

  const { error } = await supabase.from("recurring_charges").insert({
    contract_id,
    label,
    amount,
    active: true,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath(`/tenants/${tenant_id}`);
  return { ok: true };
}

/** Remove (deactivate) a recurring charge — owner-only via RLS. */
export async function removeRecurringCharge(
  _prev: RecurringState,
  formData: FormData
): Promise<RecurringState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  const tenant_id = String(formData.get("tenant_id") ?? "");
  const { data, error } = await supabase
    .from("recurring_charges")
    .update({ active: false })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "not_allowed" };

  revalidatePath(`/tenants/${tenant_id}`);
  return { ok: true };
}
