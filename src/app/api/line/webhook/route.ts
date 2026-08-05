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
  // slip verified but we don't know the room yet → ask for it
  askRoom: "ได้รับสลิปแล้ว กรุณาพิมพ์เลขห้องของคุณ เช่น 107",
  // this slip (same transaction ref) was already recorded / already received
  duplicate: "สลิปนี้ถูกบันทึกไว้แล้ว",
  // the room number they typed has no bill waiting to be paid
  noBill: (room: string) =>
    `ไม่พบบิลที่ต้องชำระสำหรับห้อง ${room} กรุณาตรวจสอบเลขห้องอีกครั้ง`,
  // success — slip recorded, awaiting owner approval. Shows the payer name so a
  // tenant can tell immediately if their slip matched the wrong room.
  received: (room: string, name: string, amount: string) =>
    `รับชำระห้อง ${room} (${name}) จำนวน ฿${amount} แล้ว รอการยืนยัน`,
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

/**
 * First 1–4 digit number in a message. Only used to read a room reply AFTER a
 * slip is awaiting a room, so a stray number in normal chat is never matched.
 */
function parseRoom(text: string | undefined): string | null {
  if (!text) return null;
  const m = text.match(/(\d{1,4})/);
  return m ? m[1] : null;
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

      // Already linked → record straight to that room's payable bill.
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
          await replyLine(
            replyToken,
            error
              ? MSG.duplicate
              : MSG.received(
                  room,
                  (bill.payer_name as string) ?? "",
                  slip.amount.toLocaleString()
                ),
            accessToken
          );
          continue;
        }
        // linked but no payable bill → hold it and tell them the room's off
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
        await replyLine(replyToken, MSG.noBill(room), accessToken);
        continue;
      }

      // Unknown account → hold the slip and ask for the room number.
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
      await replyLine(replyToken, MSG.askRoom, accessToken);
    } catch {
      await replyLine(replyToken, MSG.error, accessToken).catch(() => {});
    }
  }

  // A tenant who was asked for their room replies with a number. We only treat
  // text as a room when this user has a slip AWAITING a room — so ordinary chat
  // is never mistaken for a room number.
  for (const ev of events) {
    if (ev.type !== "message" || ev.message?.type !== "text") continue;
    const userId = ev.source?.userId;
    const replyToken = ev.replyToken;
    if (!userId || !replyToken) continue;
    const room = parseRoom(ev.message.text);
    if (!room) continue;

    const { data: waiting } = await supabase
      .from("line_pending_slips")
      .select("id, display_name, amount, sender_name, bank, image_path, slip_ref")
      .eq("line_user_id", userId)
      .eq("status", "PENDING")
      .order("created_at", { ascending: true });
    if (!waiting || waiting.length === 0) continue; // no slip waiting → ignore

    const { data: bill } = await supabase
      .from("bills")
      .select("id, payer_name")
      .eq("room_number", room)
      .in("status", ["SENT", "APPROVED", "PRINTED"])
      .order("billing_month", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!bill) {
      // keep the slip pending so they can retype the correct room
      await replyLine(replyToken, MSG.noBill(room), accessToken);
      continue;
    }

    const now = new Date().toISOString();
    let total = 0;
    let displayName = "";
    for (const w of waiting) {
      const { error } = await supabase.from("payments").insert({
        bill_id: bill.id,
        amount: w.amount,
        method: "TRANSFER",
        source: "LINE_AUTO",
        slip_image_url: w.image_path,
        slip_ref: w.slip_ref,
        slip_sender: w.sender_name,
        slip_bank: w.bank,
        slip_verified_at: now,
        verified_amount: w.amount,
        status: "RECORDED",
      });
      if (!error) {
        await supabase
          .from("line_pending_slips")
          .update({ status: "ASSIGNED", assigned_bill_id: bill.id, handled_at: now })
          .eq("id", w.id)
          .eq("status", "PENDING");
        total += Number(w.amount);
        displayName = (w.display_name as string) ?? displayName;
      }
    }

    // Remember the room so future slips from this account auto-record.
    await supabase.from("line_user_rooms").upsert({
      user_id: userId,
      display_name: displayName,
      room,
      linked_at: now,
      updated_at: now,
    });

    await replyLine(
      replyToken,
      MSG.received(room, (bill.payer_name as string) ?? "", total.toLocaleString()),
      accessToken
    );
  }

  // Always 200 so LINE doesn't retry the whole batch on a single bad event.
  return NextResponse.json({ ok: true });
}
