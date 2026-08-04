import { n, round2 } from "@/lib/billing";

export const PAYMENT_METHODS = ["CASH", "TRANSFER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUS_BADGE: Record<string, string> = {
  RECORDED: "border-transparent bg-amber-500 text-white",
  APPROVED: "border-transparent bg-emerald-600 text-white",
  RECONCILED: "border-transparent bg-blue-500 text-white",
  VOID: "border-transparent bg-muted text-muted-foreground",
};

export type Payment = {
  id: string;
  amount: string;
  method: string;
  status: string;
  slip_image_url: string | null;
  created_at: string;
};

/** Approved/reconciled payments count as paid. */
export function paidAmount(payments: { amount: string; status: string }[]): number {
  return round2(
    payments
      .filter((p) => p.status === "APPROVED" || p.status === "RECONCILED")
      .reduce((s, p) => s + n(p.amount), 0)
  );
}

/** Recorded-but-not-yet-approved payments. */
export function pendingAmount(payments: { amount: string; status: string }[]): number {
  return round2(
    payments
      .filter((p) => p.status === "RECORDED")
      .reduce((s, p) => s + n(p.amount), 0)
  );
}

export type PayState = "UNPAID" | "PARTIAL" | "PAID";

export function payState(total: number, paid: number): PayState {
  if (paid <= 0) return "UNPAID";
  if (paid + 0.001 >= total) return "PAID";
  return "PARTIAL";
}

export const PAY_STATE_BADGE: Record<PayState, string> = {
  UNPAID: "border-transparent bg-muted text-muted-foreground",
  PARTIAL: "border-transparent bg-amber-500 text-white",
  PAID: "border-transparent bg-emerald-600 text-white",
};
