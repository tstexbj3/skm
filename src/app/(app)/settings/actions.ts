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

  let qr_image_url: string | null = null;
  const file = formData.get("qr");
  if (file && typeof file !== "string" && file.size > 0) {
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${globalThis.crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from(QR_BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "image/png",
        upsert: true,
      });
    if (upErr) return { error: upErr.message };
    qr_image_url = path;
  }

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
  const file = formData.get("qr");
  if (file && typeof file !== "string" && file.size > 0) {
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${globalThis.crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from(QR_BUCKET)
      .upload(path, buffer, { contentType: file.type || "image/png", upsert: true });
    if (upErr) return { error: upErr.message };
    patch.qr_image_url = path;
  }

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
