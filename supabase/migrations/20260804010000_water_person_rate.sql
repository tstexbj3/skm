-- ============================================================================
-- Migration 0003: property-wide per-person water rate (owner-configurable).
-- Lives on utility_rates (building-wide, effective-dated) so bills snapshot it
-- and changing it never alters past bills. Default 100 ฿/person.
-- ============================================================================

alter table public.utility_rates
  add column if not exists water_person_rate numeric(12,2) not null default 100;
