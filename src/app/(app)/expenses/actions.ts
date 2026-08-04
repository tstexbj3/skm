"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { EXPENSE_MEDIA_BUCKET } from "@/lib/buckets";
import { FORM_CATEGORIES, type ExpenseCategory } from "@/lib/expenses";
import { n } from "@/lib/billing";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ExpenseState = { error?: string; ok?: boolean };

function num(v: FormDataEntryValue | null): number {
  return n(String(v ?? "").replace(/,/g, ""));
}

async function upload(
  supabase: SupabaseClient,
  folder: string,
  field: string,
  file: FormDataEntryValue | null
): Promise<string | null> {
  if (!file || typeof file === "string" || file.size === 0) return null;
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${folder}/${field}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(EXPENSE_MEDIA_BUCKET)
    .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

/** Record a spending item (staff). Owner approves later. SALARY is via HR only. */
export async function recordExpense(
  _prev: ExpenseState,
  formData: FormData
): Promise<ExpenseState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const category = String(formData.get("category") ?? "") as ExpenseCategory;
  if (!FORM_CATEGORIES.includes(category)) return { error: "category" };
  const amount = num(formData.get("amount"));
  if (amount <= 0) return { error: "amount" };

  const room_id = String(formData.get("room_id") ?? "") || null;
  const expense_date =
    String(formData.get("expense_date") ?? "") ||
    new Date().toISOString().slice(0, 10);

  const folder = globalThis.crypto.randomUUID();
  let bill_image_url: string | null;
  let item_image_url: string | null;
  try {
    bill_image_url = await upload(supabase, folder, "bill", formData.get("bill_image"));
    item_image_url = await upload(supabase, folder, "item", formData.get("item_image"));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "upload_failed" };
  }

  const { error } = await supabase.from("expenses").insert({
    category,
    amount,
    description: String(formData.get("description") ?? "").trim(),
    room_id,
    is_common_area: !room_id,
    bill_image_url,
    item_image_url,
    expense_date,
    status: "PENDING_APPROVAL",
    created_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/expenses");
  return { ok: true };
}

/** Owner approves an expense. Missing bill photo requires acknowledgement. */
export async function approveExpense(
  _prev: ExpenseState,
  formData: FormData
): Promise<ExpenseState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  const ack = String(formData.get("ack") ?? "") === "true";

  const { data: exp } = await supabase
    .from("expenses")
    .select("bill_image_url")
    .eq("id", id)
    .maybeSingle();
  if (!exp) return { error: "not_found" };
  if (!exp.bill_image_url && !ack) return { error: "need_ack" };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("expenses")
    .update({
      status: "APPROVED",
      approved_by: user.id,
      approved_at: now,
      no_bill_ack: exp.bill_image_url ? false : true,
    })
    .eq("id", id)
    .eq("status", "PENDING_APPROVAL")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "not_allowed" };

  revalidatePath("/expenses");
  return { ok: true };
}

/** Owner voids an expense. */
export async function voidExpense(
  _prev: ExpenseState,
  formData: FormData
): Promise<ExpenseState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  const { data, error } = await supabase
    .from("expenses")
    .update({ status: "VOID" })
    .eq("id", id)
    .in("status", ["PENDING_APPROVAL", "APPROVED"])
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "not_allowed" };

  revalidatePath("/expenses");
  return { ok: true };
}
