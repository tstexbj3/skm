-- ============================================================================
-- Migration 0026: delete_bill() releases held LINE slips first.
-- A bill with a LINE slip assigned could not be deleted at all (FK from
-- line_pending_slips.assigned_bill_id blocked it). Now those slips return to
-- PENDING (back onto the /line-slips page, image kept) before the payments
-- and the bill are removed. Found while cleaning up test data on 2026-11-03.
-- ============================================================================

create or replace function public.delete_bill(p_bill_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.payments
    where bill_id = p_bill_id and status in ('APPROVED', 'RECONCILED')
  ) then
    raise exception 'has_payments' using errcode = 'P0001';
  end if;
  update public.line_pending_slips
     set status = 'PENDING', assigned_bill_id = null,
         handled_by = null, handled_at = null
   where assigned_bill_id = p_bill_id;
  delete from public.payments where bill_id = p_bill_id;
  delete from public.bills where id = p_bill_id; -- cascades bill_line_items
end;
$$;
