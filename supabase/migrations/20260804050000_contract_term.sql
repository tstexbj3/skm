-- ============================================================================
-- Migration 0007: contract term (duration) + expiry.
--   term_months : agreed length of the lease.
--   end_date    : when the lease ends (start_date + term). Drives the
--                 "expiring soon" reminder and renewals.
-- ============================================================================

alter table public.contracts
  add column if not exists term_months integer,
  add column if not exists end_date date;

create index if not exists contracts_end_date_idx
  on public.contracts (end_date)
  where status = 'ACTIVE';
