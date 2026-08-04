"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_SLIPS_BUCKET } from "@/lib/buckets";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payments";
import { n } from "@/lib/billing";

export type PaymentState = { error?: string; ok?: boolean };

function num(v: FormDataEntryValue | null): number {
  return n(String(v ?? "").replace(/,/g, ""));
}

/** Record a payment against a bill (cash or transfer, partial allowed). */
export async function recordPayment(
  _prev: PaymentState,
  formData: FormData
): Promise<PaymentState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const bill_id = String(formData.get("bill_id") ?? "");
  if (!bill_id) return { error: "invalid" };
  const methodRaw = String(formData.get("method") ?? "");
  const method: PaymentMethod = (PAYMENT_METHODS as readonly string[]).includes(
    methodRaw
  )
    ? (methodRaw as PaymentMethod)
    : "CASH";
  const amount = num(formData.get("amount"));
  if (amount <= 0) return { error: "amount" };

  let slip_image_url: string | null = null;
  const file = formData.get("slip");
  if (file && typeof file !== "string" && file.size > 0) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${bill_id}/${globalThis.crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from(PAYMENT_SLIPS_BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });
    if (upErr) return { error: upErr.message };
    slip_image_url = path;
  }

  const { error } = await supabase.from("payments").insert({
    bill_id,
    amount,
    method,
    source: "MANUAL",
    slip_image_url,
    status: "RECORDED",
    created_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath(`/billing/${bill_id}`);
  revalidatePath("/billing");
  revalidatePath("/payments");
  return { ok: true };
}

/** Owner approves a recorded payment. */
export async function approvePayment(
  _prev: PaymentState,
  formData: FormData
): Promise<PaymentState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("payments")
    .update({
      status: "APPROVED",
      approved_by: user.id,
      approved_at: now,
      status_changed_at: now,
    })
    .eq("id", id)
    .eq("status", "RECORDED")
    .select("id, bill_id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "not_allowed" };

  revalidatePath(`/billing/${data[0].bill_id}`);
  revalidatePath("/billing");
  revalidatePath("/payments");
  return { ok: true };
}

/** Owner voids a payment (records reversed via status, never deleted). */
export async function voidPayment(
  _prev: PaymentState,
  formData: FormData
): Promise<PaymentState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("payments")
    .update({ status: "VOID", status_changed_at: now })
    .eq("id", id)
    .in("status", ["RECORDED", "APPROVED"])
    .select("id, bill_id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "not_allowed" };

  revalidatePath(`/billing/${data[0].bill_id}`);
  revalidatePath("/billing");
  revalidatePath("/payments");
  return { ok: true };
}
