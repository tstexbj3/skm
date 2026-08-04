-- ============================================================================
-- Migration 0004: add FLAT (เหมาจ่าย) water billing mode.
-- Shops (and any room) can now bill water as PER_PERSON, PER_UNIT, or FLAT
-- (a fixed lump-sum amount per month, stored in rooms.water_rate).
-- ============================================================================

alter type public.water_billing_mode add value if not exists 'FLAT';
