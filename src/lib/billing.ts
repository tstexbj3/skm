import type { WaterMode } from "@/lib/rooms";

export const BILL_STATUSES = ["DRAFT", "SENT", "APPROVED", "PRINTED"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const BILL_STATUS_BADGE: Record<BillStatus, string> = {
  DRAFT: "border-transparent bg-secondary text-secondary-foreground",
  SENT: "border-transparent bg-amber-500 text-white",
  APPROVED: "border-transparent bg-emerald-600 text-white",
  PRINTED: "border-transparent bg-blue-500 text-white",
};

export function n(value: unknown): number {
  const x = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(x) ? x : 0;
}

export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Money with 2 decimals for the invoice (e.g. 3,500.00). */
export function formatMoney2(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Meter units consumed, handling rollover on a fixed-digit meter.
 * A 3-digit meter wraps 999 -> 000, so 997 -> 033 is (1000 + 33) - 997 = 36.
 * digits = 0 means no rollover handling.
 */
export function meterUnits(start: number, end: number, digits = 0): number {
  let u = end - start;
  if (u < 0 && digits > 0) u += Math.pow(10, digits);
  return Math.max(0, u);
}

/** Water charge by mode. PER_PERSON/FLAT are VAT-free; PER_UNIT is metered + VAT. */
export function computeWater(input: {
  mode: WaterMode;
  rate: number; // ฿/person, ฿/unit, or flat ฿ (per mode)
  persons: number;
  start: number;
  end: number;
  vat: number;
  digits?: number;
}): number {
  const { mode, rate, persons, start, end, vat, digits = 0 } = input;
  if (mode === "PER_PERSON") return round2(rate * persons);
  if (mode === "FLAT") return round2(rate);
  const units = meterUnits(start, end, digits);
  return round2(units * rate * (1 + vat));
}

/**
 * Electricity charge. Uses manualAmount (broken meter) if provided, else
 * metered units × rate × (1+VAT) with rollover. A minimum monthly charge is
 * applied last.
 */
export function computeElectricity(input: {
  start: number;
  end: number;
  rate: number;
  vat: number;
  digits?: number;
  minCharge?: number;
  manualAmount?: number | null;
}): number {
  const { start, end, rate, vat, digits = 0, minCharge = 0 } = input;
  const base =
    input.manualAmount != null && input.manualAmount !== undefined
      ? input.manualAmount
      : meterUnits(start, end, digits) * rate * (1 + vat);
  return round2(Math.max(base, minCharge));
}

/** Total (รวม) = rent + water + electricity + late fee + other + line items. */
export function computeTotal(input: {
  rent: number;
  water: number;
  electricity: number;
  lateFee: number;
  other: number;
  lineItems: number;
}): number {
  return round2(
    input.rent +
      input.water +
      input.electricity +
      input.lateFee +
      input.other +
      input.lineItems
  );
}

/** first day of a month, from an <input type="month"> value ("2026-08" -> "2026-08-01"). */
export function monthToDate(month: string): string {
  return /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : month;
}

export function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}
