-- ============================================================================
-- Migration 0011: fix purge_tenant() room freeing.
-- The intermediate "update contracts set previous_contract_id = null" fires the
-- contract_room_sync trigger, which re-occupies the room (contract still ACTIVE).
-- Fix: capture the occupied room ids first, do all deletes, then free the rooms
-- at the very end (no contracts left => trigger can't re-occupy).
-- ============================================================================

create or replace function public.purge_tenant(p_tenant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room_ids uuid[];
begin
  if not public.is_owner() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.bills b
    join public.contracts c on c.id = b.contract_id
    where c.tenant_id = p_tenant_id
  ) then
    raise exception 'has_financials' using errcode = 'P0001';
  end if;

  -- Capture rooms this tenant currently occupies (free them at the end).
  select array_agg(room_id) into v_room_ids
  from public.contracts
  where tenant_id = p_tenant_id and status = 'ACTIVE';

  delete from public.recurring_charges
    where contract_id in (select id from public.contracts where tenant_id = p_tenant_id);
  update public.expenses set moveout_id = null
    where moveout_id in (
      select id from public.move_outs
      where contract_id in (select id from public.contracts where tenant_id = p_tenant_id)
    );
  delete from public.move_outs
    where contract_id in (select id from public.contracts where tenant_id = p_tenant_id);

  delete from public.audit_logs
    where table_name = 'contracts'
      and record_id in (select id from public.contracts where tenant_id = p_tenant_id);
  update public.contracts set previous_contract_id = null where tenant_id = p_tenant_id;
  delete from public.contracts where tenant_id = p_tenant_id;

  delete from public.audit_logs where table_name = 'tenants' and record_id = p_tenant_id;
  delete from public.tenants where id = p_tenant_id;

  -- Now that no ACTIVE contract remains, free the rooms.
  if v_room_ids is not null then
    update public.rooms set status = 'VACANT', occupant_count = 0
      where id = any (v_room_ids);
  end if;
end;
$$;
