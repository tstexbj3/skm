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
  // slip image couldn't be read by EasySlip
  unreadable: "อ่านสลิปไม่สำเร็จ กรุณาส่งภาพสลิปที่ชัดเจนอีกครั้ง",
  // this slip (same transaction ref) was already recorded
  duplicate: "สลิปนี้ถูกบันทึกไว้แล้ว",
  // this LINE account isn't linked to a room yet (admin links it in the app)
  needRoom: "บัญชี LINE ของคุณยังไม่ได้ผูกกับห้องพัก กรุณาติดต่อผู้ดูแลเพื่อผูกบัญชีก่อน",
  // room has no bill waiting to be paid
  noBill: (room: string) => `ไม่พบบิลที่ต้องชำระสำหรับห้อง ${room}`,
  // success — slip recorded, awaiting owner approval. Shows the payer name so a
  // tenant can tell immediately if their slip matched the wrong room.
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

  // Record every LINE user who messaged us (with their display name) so an admin
  // can link them to a room in the app. Only fetch the profile when we don't
  // have their name yet. The room itself is set ONLY by an admin — never from
  // tenant text — so a tenant can't mis-link themselves.
  const seenUsers = new Set<string>();
  for (const ev of events) {
    if (ev.type === "message" && ev.source?.userId)
      seenUsers.add(ev.source.userId);
  }
  for (const uid of seenUsers) {
    const { data: existing } = await supabase
      .from("line_user_rooms")
      .select("display_name")
      .eq("user_id", uid)
      .maybeSingle();
    if (!existing || !existing.display_name) {
      const name = await getLineProfile(uid, accessToken);
      await supabase.from("line_user_rooms").upsert({
        user_id: uid,
        display_name: name ?? "",
        updated_at: new Date().toISOString(),
      });
    }
  }

  for (const ev of events) {
    if (ev.type !== "message" || ev.message?.type !== "image") continue;
    const replyToken = ev.replyToken;
    if (!replyToken || !ev.message.id) continue;
    const userId = ev.source?.userId;
    // room comes only from the admin-assigned link for this LINE account
    let room: string | null = null;
    if (userId) {
      const { data: st } = await supabase
        .from("line_user_rooms")
        .select("room")
        .eq("user_id", userId)
        .maybeSingle();
      room = (st?.room as string | undefined) ?? null;
    }

    try {
      const image = await getLineImage(ev.message.id, accessToken);
      const verified = await verifySlipImage(image, slipToken);
      // TEMP: log the raw EasySlip result so we can confirm field paths on the
      // first real slip, then remove. Vercel captures this in function logs.
      console.log("[line] easyslip result:", JSON.stringify(verified));
      const slip = verified.data;
      if (!verified.ok || !slip?.ref || !slip.amount) {
        await replyLine(replyToken, MSG.unreadable, accessToken);
        continue;
      }

      // Never count the same transfer twice.
      const { data: dup } = await supabase
        .from("payments")
        .select("id")
        .eq("slip_ref", slip.ref)
        .maybeSingle();
      if (dup) {
        await replyLine(replyToken, MSG.duplicate, accessToken);
        continue;
      }

      if (!room) {
        await replyLine(replyToken, MSG.needRoom, accessToken);
        continue;
      }

      // Latest payable bill for that room (issued, not draft/void).
      const { data: bill } = await supabase
        .from("bills")
        .select("id, room_number, payer_name, status")
        .eq("room_number", room)
        .in("status", ["SENT", "APPROVED", "PRINTED"])
        .order("billing_month", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!bill) {
        await replyLine(replyToken, MSG.noBill(room), accessToken);
        continue;
      }

      // Store the slip image where manual slips live (private bucket).
      const path = `line/${crypto.randomUUID()}.jpg`;
      await supabase.storage
        .from(PAYMENT_SLIPS_BUCKET)
        .upload(path, image, { contentType: "image/jpeg", upsert: false });

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
      if (error) {
        // Unique-index race on slip_ref → treat as already recorded.
        await replyLine(replyToken, MSG.duplicate, accessToken);
        continue;
      }

      await replyLine(
        replyToken,
        MSG.received(
          room,
          (bill.payer_name as string) ?? "",
          slip.amount.toLocaleString()
        ),
        accessToken
      );
    } catch {
      await replyLine(replyToken, MSG.error, accessToken).catch(() => {});
    }
  }

  // Always 200 so LINE doesn't retry the whole batch on a single bad event.
  return NextResponse.json({ ok: true });
}
