-- ============================================================================
-- Migration 0013: electricity minimum charge, meter rollover, manual entry.
--   utility_rates.electricity_min_charge : minimum monthly electricity (฿200).
--   utility_rates.meter_digits           : physical meter digit count. 3-digit
--                                          meters roll over 999 -> 000, so
--                                          units = (10^digits + end) - start
--                                          when end < start.
--   bills snapshot both, plus elec_is_manual for broken-meter manual entry.
-- ============================================================================

alter table public.utility_rates
  add column if not exists electricity_min_charge numeric(12,2) not null default 200,
  add column if not exists meter_digits integer not null default 0;

alter table public.bills
  add column if not exists elec_min_charge numeric(12,2) not null default 0,
  add column if not exists meter_digits integer not null default 0,
  add column if not exists elec_is_manual boolean not null default false;
