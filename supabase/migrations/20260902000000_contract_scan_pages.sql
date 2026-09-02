-- ============================================================================
-- Migration 0024: multi-page contract scans.
-- A สำเนาสัญญา has several pages, so contracts.contract_scan_url (single text)
-- becomes contract_scan_urls (text[], one storage path per page). Existing
-- single scans are wrapped into a one-element array. Guarded so re-running
-- (scripts/db-apply.mjs) is a no-op once the column is renamed.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contracts'
      and column_name = 'contract_scan_url'
  ) then
    alter table public.contracts rename column contract_scan_url to contract_scan_urls;
    alter table public.contracts
      alter column contract_scan_urls type text[]
        using case
          when contract_scan_urls is null then '{}'::text[]
          else array[contract_scan_urls]
        end;
    alter table public.contracts alter column contract_scan_urls set default '{}'::text[];
    alter table public.contracts alter column contract_scan_urls set not null;
  end if;
end $$;
