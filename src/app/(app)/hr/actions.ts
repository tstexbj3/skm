"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { n } from "@/lib/billing";

export type HrState = { error?: string; ok?: boolean };

function money(v: FormDataEntryValue | null): number {
  return n(String(v ?? "").replace(/,/g, ""));
}

export async function addStaff(
  _prev: HrState,
  formData: FormData
): Promise<HrState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "name_required" };

  const { error } = await supabase.from("staff_members").insert({
    full_name,
    position: String(formData.get("position") ?? "").trim() || null,
    monthly_salary: money(formData.get("monthly_salary")),
    active: true,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/hr");
  return { ok: true };
}

export async function updateStaff(
  _prev: HrState,
  formData: FormData
): Promise<HrState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!id || !full_name) return { error: "name_required" };

  const { data, error } = await supabase
    .from("staff_members")
    .update({
      full_name,
      position: String(formData.get("position") ?? "").trim() || null,
      monthly_salary: money(formData.get("monthly_salary")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "not_allowed" };

  revalidatePath("/hr");
  return { ok: true };
}

export async function toggleStaff(
  _prev: HrState,
  formData: FormData
): Promise<HrState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const { error } = await supabase
    .from("staff_members")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/hr");
  return { ok: true };
}

/** Record a salary payment as a SALARY expense (owner-only, pending approval). */
export async function paySalary(
  _prev: HrState,
  formData: FormData
): Promise<HrState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const staff_member_id = String(formData.get("staff_member_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const amount = money(formData.get("amount"));
  if (!staff_member_id || amount <= 0) return { error: "amount" };
  const deduct = String(formData.get("deduct_from_income") ?? "") === "true";

  const { error } = await supabase.from("expenses").insert({
    category: "SALARY",
    amount,
    description: name,
    is_common_area: true,
    staff_member_id,
    deduct_from_income: deduct,
    expense_date: new Date().toISOString().slice(0, 10),
    status: "PENDING_APPROVAL",
    created_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/hr");
  revalidatePath("/expenses");
  return { ok: true };
}
