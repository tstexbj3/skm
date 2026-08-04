import { Resend } from "resend";

/**
 * Lazily construct the Resend client so a missing RESEND_API_KEY doesn't crash
 * modules that merely import this (email is best-effort). Returns null when no
 * key is configured — callers should skip sending in that case.
 */
export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

/** Owner inbox that receives fled-tenant ("หนี") data dumps and reports. */
export const OWNER_EMAIL =
  process.env.OWNER_NOTIFY_EMAIL ?? "sahapap.pht@gmail.com";

export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "SKM <onboarding@resend.dev>";
