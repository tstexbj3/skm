-- ============================================================================
-- Migration 0012: print_bill() — lets STAFF (admin or owner) print an APPROVED
-- bill and record the print, even though admins have no UPDATE on non-draft
-- bills. First print -> PRINTED; further prints increment print_count (reprint).
-- SECURITY DEFINER, gated by admin_can('billing'); only touches print fields.
-- ============================================================================

create or replace function public.print_bill(p_bill_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status public.bill_status;
begin
  if not public.admin_can('billing') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select status into v_status from public.bills where id = p_bill_id;
  if v_status is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_status not in ('APPROVED', 'PRINTED') then
    raise exception 'not_printable' using errcode = 'P0001';
  end if;

  update public.bills
    set status = 'PRINTED',
        print_count = print_count + 1,
        last_printed_at = now(),
        status_changed_at = case when status <> 'PRINTED' then now() else status_changed_at end
    where id = p_bill_id;
end;
$$;

grant execute on function public.print_bill(uuid) to authenticated;
