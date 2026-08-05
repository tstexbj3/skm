import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYMENT_SLIPS_BUCKET } from "@/lib/buckets";

// Node runtime (service-role client + storage).
export const runtime = "nodejs";

// ── Retention windows (months) — tune here ──────────────────────────────────
// The DB keeps every payment's verified slip data (ref, amount, sender, bank)
// forever as the audit trail; only the IMAGE file is aged out to keep Storage
// from growing without bound.
const SLIP_IMAGE_MONTHS = 12; // delete settled-payment slip images after this
const ASSIGNED_ROW_MONTHS = 3; // drop resolved LINE intake rows (keep the file)
const ABANDONED_SLIP_MONTHS = 6; // drop never-answered held slips (delete file)

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
}

const strs = (arr: (string | null)[]): string[] =>
  arr.filter((s): s is string => Boolean(s));

/**
 * Scheduled housekeeping (Vercel Cron, daily). Ages out slip image files so
 * Supabase Storage stays flat over the years. Authorized by CRON_SECRET, which
 * Vercel sends as `Authorization: Bearer <CRON_SECRET>` on cron invocations.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  let deletedImages = 0;
  let clearedPayments = 0;
  let prunedAssigned = 0;
  let prunedAbandoned = 0;

  // 1) Settled payments (approved/reconciled/void): delete the slip image, keep
  //    the record. Verified data on the row remains the audit trail.
  const { data: oldPays } = await supabase
    .from("payments")
    .select("id, slip_image_url")
    .in("status", ["APPROVED", "RECONCILED", "VOID"])
    .not("slip_image_url", "is", null)
    .lt("status_changed_at", monthsAgo(SLIP_IMAGE_MONTHS))
    .limit(1000);
  const payPaths = strs((oldPays ?? []).map((p) => p.slip_image_url as string | null));
  if (payPaths.length) {
    await supabase.storage.from(PAYMENT_SLIPS_BUCKET).remove(payPaths);
    deletedImages += payPaths.length;
    for (const p of oldPays ?? []) {
      await supabase
        .from("payments")
        .update({ slip_image_url: null })
        .eq("id", p.id as string);
      clearedPayments++;
    }
  }

  // 2) Resolved LINE intake rows (assigned): the image is now the payment's
  //    slip, so keep the file — just drop the buffer row.
  const { data: assigned } = await supabase
    .from("line_pending_slips")
    .select("id")
    .eq("status", "ASSIGNED")
    .lt("handled_at", monthsAgo(ASSIGNED_ROW_MONTHS))
    .limit(1000);
  for (const a of assigned ?? []) {
    await supabase.from("line_pending_slips").delete().eq("id", a.id as string);
    prunedAssigned++;
  }

  // 3) Abandoned held slips (tenant never gave a room): delete file + row.
  const { data: abandoned } = await supabase
    .from("line_pending_slips")
    .select("id, image_path")
    .eq("status", "PENDING")
    .lt("created_at", monthsAgo(ABANDONED_SLIP_MONTHS))
    .limit(1000);
  const abPaths = strs((abandoned ?? []).map((a) => a.image_path as string | null));
  if (abPaths.length) {
    await supabase.storage.from(PAYMENT_SLIPS_BUCKET).remove(abPaths);
    deletedImages += abPaths.length;
  }
  for (const a of abandoned ?? []) {
    await supabase.from("line_pending_slips").delete().eq("id", a.id as string);
    prunedAbandoned++;
  }

  return NextResponse.json({
    ok: true,
    deletedImages,
    clearedPayments,
    prunedAssigned,
    prunedAbandoned,
  });
}
