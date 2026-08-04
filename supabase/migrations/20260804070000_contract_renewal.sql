-- ============================================================================
-- Migration 0009: renewal keeps the old contract.
--   * New status RENEWED: the previous contract is archived (kept), NOT deleted,
--     and NOT treated as ENDED (so the room stays occupied).
--   * previous_contract_id links a new contract back to the one it renewed,
--     forming a full renewal chain / history.
-- The one-active-contract-per-room index only covers ACTIVE rows, so archiving
-- the old one (RENEWED) frees the slot for the new ACTIVE contract.
-- ============================================================================

alter type public.contract_status add value if not exists 'RENEWED';

alter table public.contracts
  add column if not exists previous_contract_id uuid references public.contracts(id);

create index if not exists contracts_previous_idx
  on public.contracts (previous_contract_id);
