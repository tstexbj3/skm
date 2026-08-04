-- ============================================================================
-- Migration 0002: per-room occupant count for PER_PERSON water billing.
-- This property charges water at a flat 100 ฿/person, so the room stores how
-- many people live in it; water_amount = 100 * occupant_count.
-- (PER_UNIT rooms/shops keep using rooms.water_rate as ฿/unit.)
-- ============================================================================

alter table public.rooms
  add column if not exists occupant_count integer not null default 0;
