export type ExpiryState = "none" | "ok" | "soon" | "expired";

/** Days until end_date and a coarse state used for reminders/badges. */
export function contractExpiry(
  endDate: string | null | undefined,
  now: Date = new Date()
): { state: ExpiryState; days: number | null } {
  if (!endDate) return { state: "none", days: null };
  const end = new Date(endDate + "T00:00:00");
  const days = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
  const state: ExpiryState = days < 0 ? "expired" : days <= 30 ? "soon" : "ok";
  return { state, days };
}

/** Add whole months to an ISO date (YYYY-MM-DD), returning ISO. */
export function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export const EXPIRY_BADGE: Record<Exclude<ExpiryState, "none">, string> = {
  ok: "border-transparent bg-secondary text-secondary-foreground",
  soon: "border-transparent bg-amber-500 text-white",
  expired: "border-transparent bg-red-500 text-white",
};
