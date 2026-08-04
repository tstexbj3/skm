-- ============================================================================
-- Migration 0015: property settings + payment accounts are operational billing
-- config, so allow STAFF (admin + owner) to manage them (was owner-only). Also
-- set_bill_account() lets staff choose the payment account on a bill at any
-- stage (e.g. right before printing an approved bill).
-- ============================================================================

-- property settings: staff may write
drop policy if exists "prop: owner insert" on public.property_settings;
drop policy if exists "prop: owner update" on public.property_settings;
create policy "prop: staff insert" on public.property_settings for insert to authenticated
  with check (public.is_staff());
create policy "prop: staff update" on public.property_settings for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- payment accounts: staff may write
drop policy if exists "pay: owner insert" on public.payment_accounts;
drop policy if exists "pay: owner update" on public.payment_accounts;
create policy "pay: staff insert" on public.payment_accounts for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());
create policy "pay: staff update" on public.payment_accounts for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- QR storage: staff may write
drop policy if exists "qr: owner insert" on storage.objects;
drop policy if exists "qr: owner update" on storage.objects;
drop policy if exists "qr: owner delete" on storage.objects;
create policy "qr: staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-qr' and public.is_staff());
create policy "qr: staff update" on storage.objects for update to authenticated
  using (bucket_id = 'payment-qr' and public.is_staff());
create policy "qr: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'payment-qr' and public.is_staff());

-- choose the payment account on any bill (draft or issued), staff-gated
create or replace function public.set_bill_account(p_bill_id uuid, p_account_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_can('billing') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.bills set payment_account_id = p_account_id where id = p_bill_id;
end;
$$;
grant execute on function public.set_bill_account(uuid, uuid) to authenticated;
