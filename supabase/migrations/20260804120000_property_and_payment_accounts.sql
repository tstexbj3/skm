-- ============================================================================
-- Migration 0014: invoice enhancements.
--   property_settings : property name + address shown on every invoice.
--   payment_accounts  : bank accounts + QR (owner-managed), selectable per bill.
--   bills.payment_account_id : which account this invoice shows for transfers.
--   payment-qr storage bucket (public) for the QR images.
-- ============================================================================

-- ---- property settings (single row) ----
create table public.property_settings (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  address    text,
  phone      text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.property_settings to authenticated;
alter table public.property_settings enable row level security;
create policy "prop: staff read" on public.property_settings for select to authenticated
  using (public.is_staff());
create policy "prop: owner insert" on public.property_settings for insert to authenticated
  with check (public.is_owner());
create policy "prop: owner update" on public.property_settings for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

insert into public.property_settings (name, address)
values ('สุขเกษมแมนชั่น', '');

-- ---- payment accounts (bank + QR) ----
create table public.payment_accounts (
  id             uuid primary key default gen_random_uuid(),
  bank_name      text not null,
  account_name   text not null,
  account_number text not null,
  qr_image_url   text,
  active         boolean not null default true,
  sort_order     integer not null default 0,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
grant select, insert, update on public.payment_accounts to authenticated;
alter table public.payment_accounts enable row level security;
create policy "pay: staff read" on public.payment_accounts for select to authenticated
  using (public.is_staff());
create policy "pay: owner insert" on public.payment_accounts for insert to authenticated
  with check (public.is_owner());
create policy "pay: owner update" on public.payment_accounts for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---- bill -> chosen account ----
alter table public.bills
  add column if not exists payment_account_id uuid references public.payment_accounts(id);

-- ---- QR storage bucket (public; QR codes are not secret) ----
insert into storage.buckets (id, name, public)
values ('payment-qr', 'payment-qr', true)
on conflict (id) do nothing;

drop policy if exists "qr: owner insert" on storage.objects;
create policy "qr: owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-qr' and public.is_owner());
drop policy if exists "qr: owner update" on storage.objects;
create policy "qr: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'payment-qr' and public.is_owner());
drop policy if exists "qr: owner delete" on storage.objects;
create policy "qr: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'payment-qr' and public.is_owner());
