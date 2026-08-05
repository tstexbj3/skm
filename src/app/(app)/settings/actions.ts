"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { QR_BUCKET } from "@/lib/buckets";

export type SettingsState = { error?: string; ok?: boolean };

export async function updatePropertySettings(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;

  const { data: row } = await supabase
    .from("property_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  const { error } = row
    ? await supabase
        .from("property_settings")
        .update({ name, address, phone, updated_by: user.id, updated_at: new Date().toISOString() })
        .eq("id", row.id)
    : await supabase
        .from("property_settings")
        .insert({ name, address, phone, updated_by: user.id });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/billing");
  return { ok: true };
}

export async function addPaymentAccount(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const bank_name = String(formData.get("bank_name") ?? "").trim();
  const account_name = String(formData.get("account_name") ?? "").trim();
  const account_number = String(formData.get("account_number") ?? "").trim();
  if (!bank_name || !account_name || !account_number)
    return { error: "required" };

  // QR was uploaded client-side to Storage; we receive its path.
  const qr_image_url = String(formData.get("qr") ?? "") || null;

  const { error } = await supabase.from("payment_accounts").insert({
    bank_name,
    account_name,
    account_number,
    qr_image_url,
    active: true,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/billing");
  return { ok: true };
}

export async function updatePaymentAccount(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  const bank_name = String(formData.get("bank_name") ?? "").trim();
  const account_name = String(formData.get("account_name") ?? "").trim();
  const account_number = String(formData.get("account_number") ?? "").trim();
  if (!id || !bank_name || !account_name || !account_number)
    return { error: "required" };

  const patch: Record<string, unknown> = {
    bank_name,
    account_name,
    account_number,
    updated_at: new Date().toISOString(),
  };
  // New QR (if any) was uploaded client-side; empty means keep current.
  const qrPath = String(formData.get("qr") ?? "");
  if (qrPath) patch.qr_image_url = qrPath;

  const { data, error } = await supabase
    .from("payment_accounts")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "not_allowed" };

  revalidatePath("/settings");
  revalidatePath("/billing");
  return { ok: true };
}

export async function deletePaymentAccount(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  const { data: acc } = await supabase
    .from("payment_accounts")
    .select("qr_image_url")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.rpc("delete_payment_account", { p_id: id });
  if (error) {
    if (error.message.includes("not_authorized")) return { error: "auth" };
    return { error: error.message };
  }
  if (acc?.qr_image_url)
    await supabase.storage.from(QR_BUCKET).remove([acc.qr_image_url as string]);

  revalidatePath("/settings");
  revalidatePath("/billing");
  return { ok: true };
}

/**
 * Assign a held (unmatched) LINE slip to a room: record it as a payment on that
 * room's latest issued bill, mark the slip ASSIGNED, and link the LINE account
 * so future slips from it auto-record. Staff-gated by RLS.
 */
export async function assignPendingSlip(
  pendingId: string,
  room: string
): Promise<SettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };
  if (!pendingId || !room) return { error: "required" };

  const { data: ps } = await supabase
    .from("line_pending_slips")
    .select(
      "id, line_user_id, display_name, slip_ref, amount, sender_name, bank, image_path, status"
    )
    .eq("id", pendingId)
    .maybeSingle();
  if (!ps || ps.status !== "PENDING") return { error: "not_allowed" };

  const { data: bill } = await supabase
    .from("bills")
    .select("id")
    .eq("room_number", room)
    .in("status", ["SENT", "APPROVED", "PRINTED"])
    .order("billing_month", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!bill) return { error: "no_bill" };

  const now = new Date().toISOString();
  const { error: payErr } = await supabase.from("payments").insert({
    bill_id: bill.id,
    amount: ps.amount,
    method: "TRANSFER",
    source: "LINE_AUTO",
    slip_image_url: ps.image_path,
    slip_ref: ps.slip_ref,
    slip_sender: ps.sender_name,
    slip_bank: ps.bank,
    slip_verified_at: now,
    verified_amount: ps.amount,
    status: "RECORDED",
    created_by: user.id,
  });
  if (payErr) return { error: payErr.message };

  await supabase
    .from("line_pending_slips")
    .update({
      status: "ASSIGNED",
      assigned_bill_id: bill.id,
      handled_by: user.id,
      handled_at: now,
    })
    .eq("id", pendingId)
    .eq("status", "PENDING");

  // Link the account so its future slips auto-record to this room.
  await supabase.from("line_user_rooms").upsert({
    user_id: ps.line_user_id,
    display_name: ps.display_name,
    room,
    linked_by: user.id,
    linked_at: now,
    updated_at: now,
  });

  revalidatePath("/settings");
  revalidatePath("/payments");
  revalidatePath("/billing");
  return { ok: true };
}

/** Dismiss a held LINE slip that isn't a real payment (spam / wrong image). */
export async function rejectPendingSlip(
  pendingId: string
): Promise<SettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };
  if (!pendingId) return { error: "required" };

  const { data, error } = await supabase
    .from("line_pending_slips")
    .update({
      status: "REJECTED",
      handled_by: user.id,
      handled_at: new Date().toISOString(),
    })
    .eq("id", pendingId)
    .eq("status", "PENDING")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "not_allowed" };

  revalidatePath("/settings");
  return { ok: true };
}

/** Link (or unlink) a tenant's LINE account to a room. Staff-gated by RLS. */
export async function assignLineRoom(
  userId: string,
  room: string | null
): Promise<SettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };
  if (!userId) return { error: "required" };

  const { data, error } = await supabase
    .from("line_user_rooms")
    .update({
      room: room || null,
      linked_by: user.id,
      linked_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "not_allowed" };

  revalidatePath("/settings");
  return { ok: true };
}

export async function togglePaymentAccount(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const { data, error } = await supabase
    .from("payment_accounts")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "not_allowed" };

  revalidatePath("/settings");
  return { ok: true };
}
