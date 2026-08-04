-- ============================================================================
-- Migration 0010: controlled HARD DELETE (purge) — the deliberate exception to
-- "void, never delete", for removing mistakes / test data and freeing storage.
--   * deletion_logs: who purged what & when (a trail survives the delete).
--   * storage delete policy: OWNER may remove files in the app buckets.
--   * purge_tenant(): OWNER-only, refuses if any BILL exists for the tenant
--     (financial integrity), otherwise removes contracts + audit + tenant.
--     Storage files are removed by the server action via the Storage API.
-- ============================================================================

create table public.deletion_logs (
  id           uuid primary key default gen_random_uuid(),
  entity       text not null,
  entity_label text,
  reason       text,
  deleted_by   uuid references public.profiles(id),
  deleted_at   timestamptz not null default now()
);
create index on public.deletion_logs (deleted_at desc);
grant select, insert on public.deletion_logs to authenticated;
alter table public.deletion_logs enable row level security;
create policy "del: owner read" on public.deletion_logs for select to authenticated
  using (public.is_owner());
create policy "del: owner insert" on public.deletion_logs for insert to authenticated
  with check (public.is_owner() and deleted_by = auth.uid());

-- OWNER may delete files in the app buckets (cleanup / purge).
drop policy if exists "app buckets: owner delete" on storage.objects;
create policy "app buckets: owner delete" on storage.objects for delete to authenticated
  using (
    bucket_id in ('tenant-media', 'payment-slips', 'expense-media')
    and public.is_owner()
  );

create or replace function public.purge_tenant(p_tenant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Financial integrity: never purge a tenant that has issued bills.
  if exists (
    select 1 from public.bills b
    join public.contracts c on c.id = b.contract_id
    where c.tenant_id = p_tenant_id
  ) then
    raise exception 'has_financials' using errcode = 'P0001';
  end if;

  -- Free any rooms currently occupied by this tenant.
  update public.rooms set status = 'VACANT', occupant_count = 0
    where id in (
      select room_id from public.contracts
      where tenant_id = p_tenant_id and status = 'ACTIVE'
    );

  -- Dependents of the tenant's contracts.
  delete from public.recurring_charges
    where contract_id in (select id from public.contracts where tenant_id = p_tenant_id);
  update public.expenses set moveout_id = null
    where moveout_id in (
      select id from public.move_outs
      where contract_id in (select id from public.contracts where tenant_id = p_tenant_id)
    );
  delete from public.move_outs
    where contract_id in (select id from public.contracts where tenant_id = p_tenant_id);

  -- Audit trail for those contracts, then the contracts themselves.
  delete from public.audit_logs
    where table_name = 'contracts'
      and record_id in (select id from public.contracts where tenant_id = p_tenant_id);
  update public.contracts set previous_contract_id = null where tenant_id = p_tenant_id;
  delete from public.contracts where tenant_id = p_tenant_id;

  -- The tenant + its audit trail.
  delete from public.audit_logs where table_name = 'tenants' and record_id = p_tenant_id;
  delete from public.tenants where id = p_tenant_id;
end;
$$;

grant execute on function public.purge_tenant(uuid) to authenticated;
