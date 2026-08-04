export const ROOM_KINDS = ["RESIDENTIAL", "SHOP"] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];

export const ROOM_STATUSES = ["OCCUPIED", "VACANT", "PENDING_MOVEOUT"] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const WATER_MODES = ["PER_PERSON", "PER_UNIT", "FLAT"] as const;
export type WaterMode = (typeof WATER_MODES)[number];

/**
 * Fallback per-person water charge if no utility_rates row exists yet.
 * The live rate is owner-configurable and stored on utility_rates.water_person_rate.
 */
export const DEFAULT_WATER_PERSON_RATE = 100;

/** Status color coding: OCCUPIED 🔴 / VACANT 🟢 / PENDING_MOVEOUT 🔵 */
export const STATUS_DOT: Record<RoomStatus, string> = {
  OCCUPIED: "bg-red-500",
  VACANT: "bg-green-500",
  PENDING_MOVEOUT: "bg-blue-500",
};

export const STATUS_RING: Record<RoomStatus, string> = {
  OCCUPIED: "border-l-red-500",
  VACANT: "border-l-green-500",
  PENDING_MOVEOUT: "border-l-blue-500",
};

/**
 * Postgres `numeric` comes back from PostgREST as a string (to preserve
 * precision). Coerce for display only — never for money math.
 */
export type Room = {
  id: string;
  room_number: string;
  floor: number;
  room_kind: RoomKind;
  rent_rate: string;
  water_billing_mode: WaterMode;
  water_rate: string;
  occupant_count: number;
  status: RoomStatus;
  note: string | null;
};

export function formatMoney(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
