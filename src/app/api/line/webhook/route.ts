import "server-only";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyLineSignature,
  getLineImage,
  replyLine,
  type LineEvent,
} from "@/lib/line";
import { verifySlipImage } from "@/lib/easyslip";
import { PAYMENT_SLIPS_BUCKET } from "@/lib/buckets";

// crypto + Buffer + service role → Node runtime, never Edge.
export const runtime = "nodejs";

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

/** Pull a room number (1–4 digits) out of the tenant's text message. */
function parseRoom(text: string | undefined): string | null {
  if (!text) return null;
  const m = text.match(/(?:ห้อง|เลขห้อง|room|#)?\s*([0-9]{1,4})/i);
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

  // A tenant types their room number as a text message. LINE delivers text and
  // the slip image as SEPARATE webhook calls, so remember the room per user in
  // this delivery AND persist it, so a later image message can look it up.
  const roomByUser = new Map<string, string>();
  for (const ev of events) {
    if (ev.type === "message" && ev.message?.type === "text") {
      const room = parseRoom(ev.message.text);
      if (room && ev.source?.userId) {
        roomByUser.set(ev.source.userId, room);
        await supabase.from("line_user_rooms").upsert({
          user_id: ev.source.userId,
          room,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  for (const ev of events) {
    if (ev.type !== "message" || ev.message?.type !== "image") continue;
    const replyToken = ev.replyToken;
    if (!replyToken || !ev.message.id) continue;
    const userId = ev.source?.userId;
    // room from this delivery, else the last one this user persisted
    let room = userId ? roomByUser.get(userId) ?? null : null;
    if (!room && userId) {
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
        await replyLine(
          replyToken,
          "อ่านสลิปไม่สำเร็จ กรุณาส่งภาพสลิปที่ชัดเจนอีกครั้ง",
          accessToken
        );
        continue;
      }

      // Never count the same transfer twice.
      const { data: dup } = await supabase
        .from("payments")
        .select("id")
        .eq("slip_ref", slip.ref)
        .maybeSingle();
      if (dup) {
        await replyLine(replyToken, "สลิปนี้ถูกบันทึกไว้แล้ว", accessToken);
        continue;
      }

      if (!room) {
        await replyLine(
          replyToken,
          'กรุณาพิมพ์เลขห้องของคุณ แล้วส่งสลิปอีกครั้ง เช่น "305"',
          accessToken
        );
        continue;
      }

      // Latest payable bill for that room (issued, not draft/void).
      const { data: bill } = await supabase
        .from("bills")
        .select("id, room_number, status")
        .eq("room_number", room)
        .in("status", ["SENT", "APPROVED", "PRINTED"])
        .order("billing_month", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!bill) {
        await replyLine(
          replyToken,
          `ไม่พบบิลที่ต้องชำระสำหรับห้อง ${room}`,
          accessToken
        );
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
        await replyLine(replyToken, "สลิปนี้ถูกบันทึกไว้แล้ว", accessToken);
        continue;
      }

      await replyLine(
        replyToken,
        `รับสลิปห้อง ${room} จำนวน ฿${slip.amount.toLocaleString()} แล้ว รอเจ้าของยืนยัน`,
        accessToken
      );
    } catch {
      await replyLine(
        replyToken,
        "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
        accessToken
      ).catch(() => {});
    }
  }

  // Always 200 so LINE doesn't retry the whole batch on a single bad event.
  return NextResponse.json({ ok: true });
}
