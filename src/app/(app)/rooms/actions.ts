"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  ROOM_KINDS,
  ROOM_STATUSES,
  WATER_MODES,
  type RoomKind,
  type RoomStatus,
  type WaterMode,
} from "@/lib/rooms";

export type RoomFormState = { error?: string; ok?: boolean };

function oneOf<T extends readonly string[]>(
  allowed: T,
  value: FormDataEntryValue | null,
  fallback: T[number]
): T[number] {
  const v = String(value ?? "");
  return (allowed as readonly string[]).includes(v)
    ? (v as T[number])
    : fallback;
}

function money(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Create or update a room. Owner-only in practice — RLS rejects an admin UPDATE,
 * and the UI only shows the editor to owners. `id` present => update.
 */
export async function saveRoom(
  _prev: RoomFormState,
  formData: FormData
): Promise<RoomFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const room_number = String(formData.get("room_number") ?? "").trim();
  if (!room_number) return { error: "room_number_required" };

  const floorRaw = Number(formData.get("floor"));
  const floor = Number.isInteger(floorRaw) ? floorRaw : 1;

  const waterMode = oneOf(
    WATER_MODES,
    formData.get("water_billing_mode"),
    "PER_PERSON"
  ) as WaterMode;
  const occupantRaw = Number(formData.get("occupant_count"));
  const occupant_count =
    Number.isInteger(occupantRaw) && occupantRaw >= 0 ? occupantRaw : 0;

  const payload = {
    room_number,
    floor,
    room_kind: oneOf(ROOM_KINDS, formData.get("room_kind"), "RESIDENTIAL") as RoomKind,
    rent_rate: money(formData.get("rent_rate")),
    water_billing_mode: waterMode,
    // PER_PERSON: rate comes from the property-wide utility_rates.water_person_rate
    // (single source of truth), so nothing rate-related is stored on the room.
    // PER_UNIT: owner-entered ฿/unit; occupants not used.
    water_rate: waterMode === "PER_PERSON" ? 0 : money(formData.get("water_rate")),
    occupant_count: waterMode === "PER_PERSON" ? occupant_count : 0,
    status: oneOf(ROOM_STATUSES, formData.get("status"), "VACANT") as RoomStatus,
    note: String(formData.get("note") ?? "").trim() || null,
  };

  const id = String(formData.get("id") ?? "");
  const { error } = id
    ? await supabase.from("rooms").update(payload).eq("id", id)
    : await supabase.from("rooms").insert({ ...payload, created_by: user.id });

  if (error) {
    // 23505 = unique_violation on room_number
    if (error.code === "23505") return { error: "duplicate_number" };
    return { error: error.message };
  }

  revalidatePath("/rooms");
  return { ok: true };
}

/**
 * Update the property-wide utility rates — per-person water and per-unit
 * electricity (owner-only via RLS). Writes to the latest utility_rates row;
 * bills already snapshot the rates, so past bills are unaffected. Creates a
 * first row if none exists.
 */
export async function updateUtilityRates(
  _prev: RoomFormState,
  formData: FormData
): Promise<RoomFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const water_person_rate = money(formData.get("water_person_rate"));
  const electricity_unit_rate = money(formData.get("electricity_unit_rate"));
  const electricity_min_charge = money(formData.get("electricity_min_charge"));
  const meter_digits = Math.max(
    0,
    Math.trunc(Number(formData.get("meter_digits")) || 0)
  );

  const { data: latest } = await supabase
    .from("utility_rates")
    .select("id")
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = latest
    ? await supabase
        .from("utility_rates")
        .update({
          water_person_rate,
          electricity_unit_rate,
          electricity_min_charge,
          meter_digits,
        })
        .eq("id", latest.id)
    : await supabase.from("utility_rates").insert({
        electricity_unit_rate,
        vat_rate: 0.07,
        water_person_rate,
        electricity_min_charge,
        meter_digits,
        effective_from: new Date().toISOString().slice(0, 10),
        created_by: user.id,
      });

  if (error) return { error: error.message };

  revalidatePath("/rooms");
  return { ok: true };
}
