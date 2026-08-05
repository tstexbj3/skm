import crypto from "crypto";

/**
 * Helpers for the LINE Messaging API. Node runtime only (uses `crypto`).
 * Docs: https://developers.line.biz/en/reference/messaging-api/
 */

/** Verify the X-Line-Signature header (HMAC-SHA256 of the raw body, base64). */
export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string
): boolean {
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Download the binary content of an image/file message. */
export async function getLineImage(
  messageId: string,
  accessToken: string
): Promise<Buffer> {
  const res = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`LINE content fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Reply to an event with a single text message (best-effort). */
export async function replyLine(
  replyToken: string,
  text: string,
  accessToken: string
): Promise<void> {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
}

/** Minimal shape of the webhook events we handle. */
export type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; id?: string; text?: string };
};
