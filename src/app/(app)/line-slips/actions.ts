"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SlipActionState = { error?: string; ok?: boolean };

type PendingSlip = {
  id: string;
  line_user_id: string;
  slip_ref: string;
  amount: string;
  sender_name: string | null;
  bank: string | null;
  image_path: string | null;
};

/**
 * Assign a held LINE slip to a room. Always remembers the LINE-account -> room
 * link (so future slips auto-record), then records a RECORDED payment on the
 * room's latest payable bill. With no payable bill the slip stays PENDING and
 * only the link is saved.
 */
export async function assignSlip(
  _prev: SlipActionState,
  formData: FormData
): Promise<SlipActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  const room = String(formData.get("room") ?? "").trim();
  if (!id) return { error: "not_found" };
  if (!room) return { error: "room_required" };

  const { data: slip } = await supabase
    .from("line_pending_slips")
    .select("id, line_user_id, slip_ref, amount, sender_name, bank, image_path")
    .eq("id", id)
    .eq("status", "PENDING")
    .single<PendingSlip>();
  if (!slip) return { error: "not_found" };

  // The room must exist. A wrong-case match ("test" for "Test") resolves to
  // the room's canonical name; anything else is refused and nothing is saved.
  const { data: exact } = await supabase
    .from("rooms")
    .select("room_number")
    .eq("room_number", room)
    .maybeSingle();
  let canonicalRoom = exact?.room_number as string | undefined;
  if (!canonicalRoom) {
    const { data: ci } = await supabase
      .from("rooms")
      .select("room_number")
      .ilike("room_number", room.replace(/[%_]/g, "\\$&"))
      .limit(2);
    if (ci && ci.length === 1) canonicalRoom = ci[0].room_number as string;
  }
  if (!canonicalRoom) return { error: "room_not_found" };

  // Remember the account's room either way — future slips then auto-record.
  await supabase.from("line_user_rooms").upsert({
    user_id: slip.line_user_id,
    room: canonicalRoom,
    updated_at: new Date().toISOString(),
  });

  const { data: bill } = await supabase
    .from("bills")
    .select("id")
    .eq("room_number", canonicalRoom)
    .in("status", ["SENT", "APPROVED", "PRINTED"])
    .order("billing_month", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!bill) {
    revalidatePath("/line-slips");
    return { error: "no_bill" };
  }

  const now = new Date().toISOString();
  const { error: payErr } = await supabase.from("payments").insert({
    bill_id: bill.id,
    amount: slip.amount,
    method: "TRANSFER",
    source: "LINE_AUTO",
    slip_image_url: slip.image_path,
    slip_ref: slip.slip_ref,
    slip_sender: slip.sender_name,
    slip_bank: slip.bank,
    slip_verified_at: now,
    verified_amount: slip.amount,
    status: "RECORDED",
    created_by: user.id,
  });
  if (payErr) return { error: payErr.message };

  const { error: updErr } = await supabase
    .from("line_pending_slips")
    .update({
      status: "ASSIGNED",
      assigned_bill_id: bill.id,
      handled_by: user.id,
      handled_at: now,
    })
    .eq("id", id);
  if (updErr) return { error: updErr.message };

  revalidatePath("/line-slips");
  revalidatePath("/payments");
  revalidatePath(`/billing/${bill.id}`);
  return { ok: true };
}

/** Reject a held slip (not a tenant payment / wrong photo). Kept as history. */
export async function rejectSlip(
  _prev: SlipActionState,
  formData: FormData
): Promise<SlipActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const id = String(formData.get("id") ?? "");
  const { data, error } = await supabase
    .from("line_pending_slips")
    .update({
      status: "REJECTED",
      handled_by: user.id,
      handled_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "PENDING")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "not_found" };

  revalidatePath("/line-slips");
  return { ok: true };
}
