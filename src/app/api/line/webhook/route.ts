import "server-only";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyLineSignature,
  getLineImage,
  getLineProfile,
  replyLine,
  type LineEvent,
} from "@/lib/line";
import { verifySlipImage } from "@/lib/easyslip";
import { PAYMENT_SLIPS_BUCKET } from "@/lib/buckets";

// crypto + Buffer + service role → Node runtime, never Edge.
export const runtime = "nodejs";

// ───────────────────────────────────────────────────────────────────────────
// AUTO-REPLY MESSAGES — edit the Thai text here, then commit + push to deploy.
// The {room} / {amount} placeholders are filled in automatically; keep them.
// ───────────────────────────────────────────────────────────────────────────
const MSG = {
  // this slip (same transaction ref) was already recorded / already received
  duplicate: "สลิปนี้ถูกบันทึกไว้แล้ว",
  // slip received from an account not yet linked to a room — held for review
  pending: "ได้รับสลิปของคุณแล้ว กำลังตรวจสอบและจะยืนยันเร็วๆ นี้",
  // success — slip recorded to a linked room, awaiting owner approval. Shows the
  // payer name so a tenant can tell if their slip matched the wrong room.
  received: (room: string, name: string, amount: string) =>
    `รับสลิปห้อง ${room} (${name}) จำนวน ฿${amount} แล้ว รอการยืนยัน`,
  // unexpected error
  error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
};

/**
 * Diagnostic: reports WHICH env vars are present (booleans only — never the
 * values). Lets us confirm the deployment sees all four without leaking any
 * secret. Safe to leave in; it exposes no data.
 */
export async function GET() {
  // Also probe the service-role DB path: a present-but-invalid key would break
  // every DB op the webhook does (persist room, dedupe, find bill, insert).
  let db_ok = false;
  let db_error: string | null = null;
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("line_user_rooms")
      .select("user_id")
      .limit(1);
    if (error) db_error = error.message;
    else db_ok = true;
  } catch (e) {
    db_error = e instanceof Error ? e.message : "exception";
  }

  return NextResponse.json({
    configured: {
      LINE_CHANNEL_SECRET: Boolean(process.env.LINE_CHANNEL_SECRET),
      LINE_CHANNEL_ACCESS_TOKEN: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
      EASYSLIP_TOKEN: Boolean(process.env.EASYSLIP_TOKEN),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    db_ok,
    db_error,
  });
}

export async function POST(req: Request) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const slipToken = process.env.EASYSLIP_TOKEN;
  if (!secret || !accessToken || !slipToken || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  if (!verifyLineSignature(rawBody, req.headers.get("x-line-signature"), secret)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(rawBody).events as LineEvent[]) ?? [];
  } catch {
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();

  // Only react to slip IMAGES. Text questions and non-slip photos are left for a
  // human — the bot stays silent, so the general support chat isn't disturbed
  // and non-tenants never surface in the app.
  for (const ev of events) {
    if (ev.type !== "message" || ev.message?.type !== "image") continue;
    const replyToken = ev.replyToken;
    const userId = ev.source?.userId;
    if (!replyToken || !ev.message.id || !userId) continue;

    try {
      const image = await getLineImage(ev.message.id, accessToken);
      const verified = await verifySlipImage(image, slipToken);
      const slip = verified.data;
      // Not a readable bank slip → stay silent (probably a normal photo).
      if (!verified.ok || !slip?.ref || !slip.amount) continue;

      // Never record the same transfer twice (already recorded or already held).
      const [{ data: paidDup }, { data: pendDup }] = await Promise.all([
        supabase.from("payments").select("id").eq("slip_ref", slip.ref).maybeSingle(),
        supabase
          .from("line_pending_slips")
          .select("id")
          .eq("slip_ref", slip.ref)
          .maybeSingle(),
      ]);
      if (paidDup || pendDup) {
        await replyLine(replyToken, MSG.duplicate, accessToken);
        continue;
      }

      // Keep the slip image (private bucket) — needed for either path.
      const path = `line/${crypto.randomUUID()}.jpg`;
      await supabase.storage
        .from(PAYMENT_SLIPS_BUCKET)
        .upload(path, image, { contentType: "image/jpeg", upsert: false });

      // Is this LINE account already linked to a room?
      const { data: link } = await supabase
        .from("line_user_rooms")
        .select("room")
        .eq("user_id", userId)
        .maybeSingle();
      const room = (link?.room as string | undefined) ?? null;

      // Linked → record straight to that room's payable bill.
      if (room) {
        const { data: bill } = await supabase
          .from("bills")
          .select("id, payer_name")
          .eq("room_number", room)
          .in("status", ["SENT", "APPROVED", "PRINTED"])
          .order("billing_month", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (bill) {
          const { error } = await supabase.from("payments").insert({
            bill_id: bill.id,
            amount: slip.amount,
            method: "TRANSFER",
            source: "LINE_AUTO",
            slip_image_url: path,
            slip_ref: slip.ref,
            slip_sender: slip.senderName,
            slip_bank: slip.bank,
            slip_verified_at: new Date().toISOString(),
            verified_amount: slip.amount,
            status: "RECORDED",
          });
          if (!error) {
            await replyLine(
              replyToken,
              MSG.received(
                room,
                (bill.payer_name as string) ?? "",
                slip.amount.toLocaleString()
              ),
              accessToken
            );
            continue;
          }
          // insert failed → fall through and hold it for the admin instead
        }
        // linked but no payable bill yet → hold for the admin
      }

      // Unknown account (or linked with no bill) → hold for the admin to assign.
      const name = await getLineProfile(userId, accessToken);
      await supabase.from("line_pending_slips").insert({
        line_user_id: userId,
        display_name: name ?? "",
        slip_ref: slip.ref,
        amount: slip.amount,
        sender_name: slip.senderName,
        bank: slip.bank,
        image_path: path,
        status: "PENDING",
      });
      await replyLine(replyToken, MSG.pending, accessToken);
    } catch {
      await replyLine(replyToken, MSG.error, accessToken).catch(() => {});
    }
  }

  // Always 200 so LINE doesn't retry the whole batch on a single bad event.
  return NextResponse.json({ ok: true });
}
