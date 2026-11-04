"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getResend, OWNER_EMAIL, FROM_EMAIL } from "@/lib/email/resend";
import { n } from "@/lib/billing";

export type MoveoutState = { error?: string; ok?: boolean };

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) /
      86_400_000
  );
}

/** Admin notifies a move-out. Room becomes PENDING_MOVEOUT (via trigger). */
export async function notifyMoveout(
  _prev: MoveoutState,
  formData: FormData
): Promise<MoveoutState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const contract_id = String(formData.get("contract_id") ?? "");
  const move_out_date = String(formData.get("move_out_date") ?? "");
  if (!contract_id || !move_out_date) return { error: "invalid" };
  // Notice date comes from the form so past move-outs can be recorded
  // retroactively; it defaults to today and may never be after the move-out.
  const rawNotice = String(formData.get("notice_date") ?? "");
  const notice_date = /^\d{4}-\d{2}-\d{2}$/.test(rawNotice)
    ? rawNotice
    : new Date().toISOString().slice(0, 10);
  const days = daysBetween(notice_date, move_out_date);
  if (days < 0) return { error: "invalid" };

  const { data: c } = await supabase
    .from("contracts")
    .select("advance_rent_amount, damage_deposit_amount, room:rooms(rent_rate)")
    .eq("id", contract_id)
    .single();
  const contract = c as unknown as {
    advance_rent_amount: string;
    damage_deposit_amount: string;
    room: { rent_rate: string } | null;
  } | null;
  if (!contract) return { error: "not_found" };

  const advance = n(contract.advance_rent_amount);
  const damage = n(contract.damage_deposit_amount);
  const lastMonthRent = n(contract.room?.rent_rate);

  const { error } = await supabase.from("move_outs").insert({
    contract_id,
    notice_date,
    move_out_date,
    advance_rent_snapshot: advance,
    damage_deposit_snapshot: damage,
    last_month_rent: lastMonthRent,
    advance_applied: Math.min(advance, lastMonthRent),
    damage_deductions: 0,
    damage_deposit_refund: days >= 30 ? damage : 0,
    deposit_refunded: false,
    red_flag_no_refund: days < 30,
    fled: false,
    status: "NOTIFIED",
    created_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "exists" };
    return { error: error.message };
  }

  revalidatePath("/moveouts");
  revalidatePath("/rooms");
  return { ok: true };
}

/** Owner sets damage deductions; refund recomputes. */
export async function setMoveoutFinancials(
  _prev: MoveoutState,
  formData: FormData
): Promise<MoveoutState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  const deductions = n(String(formData.get("damage_deductions") ?? ""));
  const { data: mo } = await supabase
    .from("move_outs")
    .select("damage_deposit_snapshot, red_flag_no_refund")
    .eq("id", id)
    .maybeSingle();
  if (!mo) return { error: "not_found" };

  const damage = n(mo.damage_deposit_snapshot);
  const refund = mo.red_flag_no_refund ? 0 : Math.max(0, damage - deductions);

  const { data, error } = await supabase
    .from("move_outs")
    .update({ damage_deductions: deductions, damage_deposit_refund: refund })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "not_allowed" };

  revalidatePath("/moveouts");
  return { ok: true };
}

async function setStatus(id: string, from: string, to: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" as const, supabase: null, user: null };
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("move_outs")
    .update({
      status: to,
      status_changed_at: now,
      ...(to === "APPROVED" ? { approved_by: user.id, approved_at: now } : {}),
      ...(to === "FLED" ? { fled: true } : {}),
    })
    .eq("id", id)
    .eq("status", from)
    .select("id, contract_id, damage_deposit_refund");
  return { error, data, supabase, user };
}

export async function approveMoveout(_prev: MoveoutState, formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { error, data } = await setStatus(id, "NOTIFIED", "APPROVED");
  if (error) return { error: typeof error === "string" ? error : error.message };
  if (!data || data.length === 0) return { error: "not_allowed" };
  revalidatePath("/moveouts");
  return { ok: true };
}

/** Complete a move-out: contract ENDED + room VACANT (trigger); record refund. */
export async function completeMoveout(_prev: MoveoutState, formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { error, data, supabase, user } = await setStatus(
    id,
    "APPROVED",
    "COMPLETED"
  );
  if (error) return { error: typeof error === "string" ? error : error.message };
  if (!data || data.length === 0 || !supabase || !user)
    return { error: "not_allowed" };

  const refund = n(data[0].damage_deposit_refund);
  if (refund > 0) {
    await supabase.from("move_outs").update({ deposit_refunded: true }).eq("id", id);
    await supabase.from("expenses").insert({
      category: "DEPOSIT_RETURN",
      amount: refund,
      description: "คืนเงินมัดจำ",
      is_common_area: true,
      moveout_id: id,
      expense_date: new Date().toISOString().slice(0, 10),
      status: "PENDING_APPROVAL",
      created_by: user.id,
    });
  }
  revalidatePath("/moveouts");
  revalidatePath("/rooms");
  revalidatePath("/expenses");
  return { ok: true };
}

/** Tenant fled (หนี): mark FLED, end contract, email all tenant data to owner. */
export async function fledMoveout(_prev: MoveoutState, formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { error, data, supabase } = await setStatus(id, "NOTIFIED", "FLED");
  if (error) return { error: typeof error === "string" ? error : error.message };
  if (!data || data.length === 0 || !supabase) return { error: "not_allowed" };

  // Gather all tenant data and email the owner (best-effort).
  try {
    const resend = getResend();
    if (!resend) throw new Error("no_resend_key");
    const contractId = data[0].contract_id as string;
    const { data: c } = await supabase
      .from("contracts")
      .select(
        "start_date, end_date, advance_rent_amount, damage_deposit_amount, tenant:tenants(full_name, phone, national_id_image_url, co_tenant_name), room:rooms(room_number)"
      )
      .eq("id", contractId)
      .single();
    const info = c as unknown as {
      start_date: string;
      tenant: {
        full_name: string;
        phone: string | null;
        co_tenant_name: string | null;
      } | null;
      room: { room_number: string } | null;
    } | null;
    const html = `
      <h2>ผู้เช่าหนี (Tenant fled)</h2>
      <p><b>ห้อง / Room:</b> ${info?.room?.room_number ?? "-"}</p>
      <p><b>ผู้เช่า / Tenant:</b> ${info?.tenant?.full_name ?? "-"}</p>
      <p><b>เบอร์โทร / Phone:</b> ${info?.tenant?.phone ?? "-"}</p>
      <p><b>ผู้เช่าร่วม / Co-tenant:</b> ${info?.tenant?.co_tenant_name ?? "-"}</p>
      <p><b>เริ่มสัญญา / Start:</b> ${info?.start_date ?? "-"}</p>`;
    await resend.emails.send({
      from: FROM_EMAIL,
      to: OWNER_EMAIL,
      subject: `ผู้เช่าหนี ห้อง ${info?.room?.room_number ?? ""}`,
      html,
    });
  } catch {
    // email is best-effort; the FLED status is already recorded
  }

  revalidatePath("/moveouts");
  revalidatePath("/rooms");
  return { ok: true };
}
