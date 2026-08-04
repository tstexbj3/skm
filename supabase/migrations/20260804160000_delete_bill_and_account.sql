-- ============================================================================
-- Migration 0018: controlled hard-delete for bills and payment accounts.
--   delete_bill()            : OWNER only; refuses if the bill has APPROVED or
--                              RECONCILED payments (financial integrity).
--                              Removes payments + (cascade) line items + bill.
--   delete_payment_account() : STAFF; nulls the account off any bills, then
--                              deletes the account row.
-- Storage files (payment slips, QR) are removed by the server actions.
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
  delete from public.payments where bill_id = p_bill_id;
  delete from public.bills where id = p_bill_id; -- cascades bill_line_items
end;
$$;
grant execute on function public.delete_bill(uuid) to authenticated;

create or replace function public.delete_payment_account(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.bills set payment_account_id = null where payment_account_id = p_id;
  delete from public.payment_accounts where id = p_id;
end;
$$;
grant execute on function public.delete_payment_account(uuid) to authenticated;
