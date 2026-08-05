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
