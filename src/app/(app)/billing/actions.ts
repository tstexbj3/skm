"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  computeWater,
  computeElectricity,
  computeTotal,
  monthToDate,
  n,
} from "@/lib/billing";
import { PAYMENT_SLIPS_BUCKET } from "@/lib/buckets";
import type { WaterMode } from "@/lib/rooms";

export type BillActionState = { error?: string; ok?: boolean };

function num(v: FormDataEntryValue | null): number {
  return n(String(v ?? "").replace(/,/g, ""));
}

type DB = Awaited<ReturnType<typeof createClient>>;

/** Build + insert a DRAFT bill (shared by single + bulk generate). */
async function createDraftBill(
  supabase: DB,
  userId: string,
  contractId: string,
  billing_month: string
): Promise<{ id?: string; error?: string; exists?: boolean }> {
  const { data: c } = await supabase
    .from("contracts")
    .select(
      "id, occupant_count, tenant:tenants(full_name), room:rooms(id, room_number, rent_rate, water_billing_mode, water_rate)"
    )
    .eq("id", contractId)
    .single();
  const contract = c as unknown as {
    occupant_count: number;
    tenant: { full_name: string } | null;
    room: {
      id: string;
      room_number: string;
      rent_rate: string;
      water_billing_mode: WaterMode;
      water_rate: string;
    } | null;
  } | null;
  if (!contract?.room) return { error: "not_found" };
  const room = contract.room;

  const { data: rates } = await supabase
    .from("utility_rates")
    .select(
      "electricity_unit_rate, vat_rate, water_person_rate, electricity_min_charge, meter_digits"
    )
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const elecRate = n(rates?.electricity_unit_rate);
  const vat = n(rates?.vat_rate);
  const waterPersonRate = n(rates?.water_person_rate ?? 100);
  const elecMin = n(rates?.electricity_min_charge ?? 200);
  const meterDigits = n(rates?.meter_digits);

  const { data: prev } = await supabase
    .from("bills")
    .select("elec_end, water_end")
    .eq("contract_id", contractId)
    .lt("billing_month", billing_month)
    .order("billing_month", { ascending: false })
    .limit(1)
    .maybeSingle();
  const elecStart = n(prev?.elec_end);
  const waterStart = n(prev?.water_end);

  const mode = room.water_billing_mode;
  let water_rate = 0,
    water_persons = 0,
    water_vat = 0,
    ws = 0,
    we = 0;
  if (mode === "PER_PERSON") {
    water_rate = waterPersonRate;
    water_persons = contract.occupant_count;
  } else if (mode === "FLAT") {
    water_rate = n(room.water_rate);
  } else {
    water_rate = n(room.water_rate);
    water_vat = vat;
    ws = waterStart;
    we = waterStart;
  }
  const water_amount = computeWater({
    mode,
    rate: water_rate,
    persons: water_persons,
    start: ws,
    end: we,
    vat: water_vat,
    digits: meterDigits,
  });

  const rent = n(room.rent_rate);
  const elec_amount = computeElectricity({
    start: elecStart,
    end: elecStart,
    rate: elecRate,
    vat,
    digits: meterDigits,
    minCharge: elecMin,
  });

  const { data: recurring } = await supabase
    .from("recurring_charges")
    .select("id, label, amount")
    .eq("contract_id", contractId)
    .eq("active", true);
  const lineItemsTotal = (recurring ?? []).reduce(
    (s, r) => s + n(r.amount),
    0
  );

  const total = computeTotal({
    rent,
    water: water_amount,
    electricity: elec_amount,
    lateFee: 0,
    other: 0,
    lineItems: lineItemsTotal,
  });

  const { data: defaultAccount } = await supabase
    .from("payment_accounts")
    .select("id")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: bill, error } = await supabase
    .from("bills")
    .insert({
      contract_id: contractId,
      room_id: room.id,
      status: "DRAFT",
      bill_date: billing_month,
      billing_month,
      payer_name: contract.tenant?.full_name ?? "",
      room_number: room.room_number,
      rent_amount: rent,
      water_billing_mode: mode,
      water_rate,
      water_persons,
      water_start: ws,
      water_end: we,
      water_vat_rate: water_vat,
      water_amount,
      elec_unit_rate: elecRate,
      elec_start: elecStart,
      elec_end: elecStart,
      elec_vat_rate: vat,
      elec_amount,
      elec_min_charge: elecMin,
      meter_digits: meterDigits,
      elec_is_manual: false,
      late_fee_amount: 0,
      other_charge_amount: 0,
      total_amount: total,
      payment_account_id: defaultAccount?.id ?? null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !bill) {
    if (error?.code === "23505") return { exists: true };
    return { error: error?.message ?? "failed" };
  }

  if ((recurring ?? []).length) {
    await supabase.from("bill_line_items").insert(
      (recurring ?? []).map((r) => ({
        bill_id: bill.id,
        label: r.label,
        amount: n(r.amount),
        include_in_total: true,
        source_recurring: r.id,
        created_by: userId,
      }))
    );
  }

  return { id: bill.id };
}

/** Generate one DRAFT bill for a contract + month, then open it. */
export async function generateBill(
  contractId: string,
  month: string
): Promise<BillActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };
  const billing_month = monthToDate(month);
  if (!contractId || !/^\d{4}-\d{2}-\d{2}$/.test(billing_month))
    return { error: "invalid" };

  const res = await createDraftBill(supabase, user.id, contractId, billing_month);
  if (res.exists) return { error: "exists" };
  if (res.error || !res.id) return { error: res.error ?? "failed" };

  revalidatePath("/billing");
  redirect(`/billing/${res.id}`);
}

/** Generate DRAFT bills for every active tenancy that has no bill this month. */
export async function generateAllBills(
  month: string
): Promise<BillActionState & { created?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };
  const billing_month = monthToDate(month);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(billing_month)) return { error: "invalid" };

  const { data: contracts } = await supabase
    .from("contracts")
    .select("id")
    .eq("status", "ACTIVE");
  const { data: existing } = await supabase
    .from("bills")
    .select("contract_id")
    .eq("billing_month", billing_month);
  const has = new Set((existing ?? []).map((b) => b.contract_id as string));

  let created = 0;
  for (const c of contracts ?? []) {
    if (has.has(c.id as string)) continue;
    const res = await createDraftBill(
      supabase,
      user.id,
      c.id as string,
      billing_month
    );
    if (res.id) created++;
  }

  revalidatePath("/billing");
  return { ok: true, created };
}

/** Edit a DRAFT bill (meter ends, late fee, other, note) and recompute totals. */
export async function updateBill(
  _prev: BillActionState,
  formData: FormData
): Promise<BillActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  const { data: bill } = await supabase
    .from("bills")
    .select(
      "id, water_billing_mode, water_rate, water_vat_rate, water_start, elec_unit_rate, elec_vat_rate, elec_start, rent_amount, elec_min_charge, meter_digits"
    )
    .eq("id", id)
    .single<{
      water_billing_mode: WaterMode;
      water_rate: string;
      water_vat_rate: string;
      water_start: string;
      elec_unit_rate: string;
      elec_vat_rate: string;
      elec_start: string;
      rent_amount: string;
      elec_min_charge: string;
      meter_digits: number;
    }>();
  if (!bill) return { error: "not_found" };

  const digits = n(bill.meter_digits);
  const water_persons = Math.max(0, Math.trunc(num(formData.get("water_persons"))));
  const water_end = num(formData.get("water_end"));
  // Opening (start) readings are editable — needed for the first bill, whose
  // start would otherwise be 0. Fall back to the stored start when not sent.
  const rawWaterStart = formData.get("water_start");
  const water_start =
    rawWaterStart != null && String(rawWaterStart) !== ""
      ? num(rawWaterStart)
      : n(bill.water_start);
  const rawElecStart = formData.get("elec_start");
  const elec_start =
    rawElecStart != null && String(rawElecStart) !== ""
      ? num(rawElecStart)
      : n(bill.elec_start);
  const elec_is_manual =
    formData.get("elec_is_manual") === "on" ||
    formData.get("elec_is_manual") === "true";
  const elec_manual_amount = num(formData.get("elec_manual_amount"));
  const elec_end = num(formData.get("elec_end"));
  const late_fee_amount = num(formData.get("late_fee_amount"));
  const late_fee_since_date =
    String(formData.get("late_fee_since_date") ?? "") || null;
  const other_charge_label =
    String(formData.get("other_charge_label") ?? "").trim() || null;
  const other_charge_amount = num(formData.get("other_charge_amount"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const received_by = String(formData.get("received_by") ?? "").trim() || null;
  const payment_account_id =
    String(formData.get("payment_account_id") ?? "") || null;

  const water_amount = computeWater({
    mode: bill.water_billing_mode,
    rate: n(bill.water_rate),
    persons: water_persons,
    start: water_start,
    end: water_end,
    vat: n(bill.water_vat_rate),
    digits,
  });
  const elec_amount = computeElectricity({
    start: elec_start,
    end: elec_end,
    rate: n(bill.elec_unit_rate),
    vat: n(bill.elec_vat_rate),
    digits,
    minCharge: n(bill.elec_min_charge),
    manualAmount: elec_is_manual ? elec_manual_amount : null,
  });

  const { data: items } = await supabase
    .from("bill_line_items")
    .select("amount, include_in_total, status")
    .eq("bill_id", id);
  const lineItemsTotal = (items ?? [])
    .filter((i) => i.include_in_total && i.status === "ACTIVE")
    .reduce((s, i) => s + n(i.amount), 0);

  const total = computeTotal({
    rent: n(bill.rent_amount),
    water: water_amount,
    electricity: elec_amount,
    lateFee: late_fee_amount,
    other: other_charge_amount,
    lineItems: lineItemsTotal,
  });

  const { error } = await supabase
    .from("bills")
    .update({
      water_persons,
      water_start,
      water_end,
      water_amount,
      elec_start,
      elec_end,
      elec_amount,
      elec_is_manual,
      late_fee_amount,
      late_fee_since_date,
      other_charge_label,
      other_charge_amount,
      note,
      received_by,
      payment_account_id,
      total_amount: total,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/billing/${id}`);
  return { ok: true };
}

export type MeterReading = {
  billId: string;
  elecStart: number | null; // null = leave the electricity start unchanged
  elecEnd: number | null; // null = leave the electricity end unchanged
  waterStart: number | null; // null = leave the water start unchanged
  waterEnd: number | null; // null = leave the water end unchanged
};

/**
 * Batch-enter this month's meter readings for many DRAFT bills at once.
 * Recomputes water (PER_UNIT rooms only) + electricity (skipped for
 * broken-meter/manual bills, whose amount is preserved) + total, exactly like
 * updateBill but for the meter fields only — late fee, other charges, persons,
 * note and line items are left untouched. Non-DRAFT bills are ignored (admin
 * can only edit a bill while DRAFT).
 */
export async function saveMeterReadings(
  month: string,
  readings: MeterReading[]
): Promise<BillActionState & { saved?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const targets = readings.filter(
    (r) =>
      r.billId &&
      (r.elecStart != null ||
        r.elecEnd != null ||
        r.waterStart != null ||
        r.waterEnd != null)
  );
  if (!targets.length) return { ok: true, saved: 0 };
  const ids = targets.map((r) => r.billId);

  const { data: bills } = await supabase
    .from("bills")
    .select(
      "id, status, water_billing_mode, water_rate, water_vat_rate, water_start, water_end, water_persons, water_amount, elec_unit_rate, elec_vat_rate, elec_start, elec_end, elec_min_charge, meter_digits, elec_is_manual, elec_amount, rent_amount, late_fee_amount, other_charge_amount"
    )
    .in("id", ids);
  const billMap = new Map((bills ?? []).map((b) => [b.id as string, b]));

  const { data: items } = await supabase
    .from("bill_line_items")
    .select("bill_id, amount, include_in_total, status")
    .in("bill_id", ids);
  const lineTotals = new Map<string, number>();
  for (const it of items ?? []) {
    if (it.include_in_total && it.status === "ACTIVE") {
      const k = it.bill_id as string;
      lineTotals.set(k, (lineTotals.get(k) ?? 0) + n(it.amount));
    }
  }

  let saved = 0;
  for (const r of targets) {
    const b = billMap.get(r.billId);
    if (!b || b.status !== "DRAFT") continue;
    const digits = n(b.meter_digits);
    const mode = b.water_billing_mode as WaterMode;
    const patch: Record<string, unknown> = {};

    let water_amount = n(b.water_amount);
    if (mode === "PER_UNIT" && (r.waterStart != null || r.waterEnd != null)) {
      const water_start = r.waterStart ?? n(b.water_start);
      const water_end = r.waterEnd ?? n(b.water_end);
      water_amount = computeWater({
        mode,
        rate: n(b.water_rate),
        persons: n(b.water_persons),
        start: water_start,
        end: water_end,
        vat: n(b.water_vat_rate),
        digits,
      });
      patch.water_start = water_start;
      patch.water_end = water_end;
      patch.water_amount = water_amount;
    }

    let elec_amount = n(b.elec_amount);
    if (!b.elec_is_manual && (r.elecStart != null || r.elecEnd != null)) {
      const elec_start = r.elecStart ?? n(b.elec_start);
      const elec_end = r.elecEnd ?? n(b.elec_end);
      elec_amount = computeElectricity({
        start: elec_start,
        end: elec_end,
        rate: n(b.elec_unit_rate),
        vat: n(b.elec_vat_rate),
        digits,
        minCharge: n(b.elec_min_charge),
      });
      patch.elec_start = elec_start;
      patch.elec_end = elec_end;
      patch.elec_amount = elec_amount;
    }

    if (Object.keys(patch).length === 0) continue; // nothing applicable

    patch.total_amount = computeTotal({
      rent: n(b.rent_amount),
      water: water_amount,
      electricity: elec_amount,
      lateFee: n(b.late_fee_amount),
      other: n(b.other_charge_amount),
      lineItems: lineTotals.get(r.billId) ?? 0,
    });

    const { data, error } = await supabase
      .from("bills")
      .update(patch)
      .eq("id", r.billId)
      .eq("status", "DRAFT")
      .select("id");
    if (!error && data && data.length) saved++;
  }

  revalidatePath("/billing");
  revalidatePath("/billing/meters");
  return { ok: true, saved };
}

async function setStatus(
  formData: FormData,
  from: string,
  to: string
): Promise<BillActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };
  const id = String(formData.get("id") ?? "");
  const { data, error } = await supabase
    .from("bills")
    .update({ status: to, status_changed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", from)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "not_allowed" };
  revalidatePath(`/billing/${id}`);
  revalidatePath("/billing");
  return { ok: true };
}

export async function sendBill(_prev: BillActionState, formData: FormData) {
  return setStatus(formData, "DRAFT", "SENT");
}

export async function approveBill(_prev: BillActionState, formData: FormData) {
  return setStatus(formData, "SENT", "APPROVED");
}

/** Permanently delete a bill (owner-only; refused if it has approved payments). */
export async function deleteBill(
  _prev: BillActionState,
  formData: FormData
): Promise<BillActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const bill_id = String(formData.get("bill_id") ?? "");
  if (!bill_id) return { error: "invalid" };

  const { data: pays } = await supabase
    .from("payments")
    .select("slip_image_url")
    .eq("bill_id", bill_id);
  const { data: bill } = await supabase
    .from("bills")
    .select("room_number, billing_month")
    .eq("id", bill_id)
    .maybeSingle();
  const slips = (pays ?? [])
    .map((p) => p.slip_image_url as string | null)
    .filter((s): s is string => Boolean(s));

  const { error } = await supabase.rpc("delete_bill", { p_bill_id: bill_id });
  if (error) {
    if (error.message.includes("has_payments")) return { error: "has_payments" };
    if (error.message.includes("not_authorized")) return { error: "auth" };
    return { error: error.message };
  }

  if (slips.length)
    await supabase.storage.from(PAYMENT_SLIPS_BUCKET).remove(slips);
  await supabase.from("deletion_logs").insert({
    entity: "bill",
    entity_label: `${bill?.room_number ?? ""} ${bill?.billing_month ?? ""}`.trim(),
    deleted_by: user.id,
  });

  revalidatePath("/billing");
  redirect("/billing");
}

/** Choose the payment account shown on a bill (any stage; staff-gated). */
export async function setBillAccount(
  _prev: BillActionState,
  formData: FormData
): Promise<BillActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };
  const bill_id = String(formData.get("bill_id") ?? "");
  const account_id = String(formData.get("account_id") ?? "") || null;
  const { error } = await supabase.rpc("set_bill_account", {
    p_bill_id: bill_id,
    p_account_id: account_id,
  });
  if (error) {
    if (error.message.includes("not_authorized")) return { error: "auth" };
    return { error: error.message };
  }
  revalidatePath(`/billing/${bill_id}`);
  return { ok: true };
}

export async function printBill(
  _prev: BillActionState,
  formData: FormData
): Promise<BillActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };
  const id = String(formData.get("id") ?? "");
  const { error } = await supabase.rpc("print_bill", { p_bill_id: id });
  if (error) {
    if (error.message.includes("not_printable")) return { error: "not_printable" };
    if (error.message.includes("not_authorized")) return { error: "auth" };
    return { error: error.message };
  }
  revalidatePath(`/billing/${id}`);
  revalidatePath("/billing");
  return { ok: true };
}
