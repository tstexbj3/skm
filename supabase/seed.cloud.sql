-- ============================================================================
-- CLOUD seed. Run this in the Supabase SQL Editor AFTER you have:
--   1) applied the migration (20260721000000_init.sql), and
--   2) created two users in Dashboard → Authentication → Add user:
--        owner@skm.local   (password: password123, "Auto Confirm" on)
--        admin@skm.local   (password: password123, "Auto Confirm" on)
-- The handle_new_user trigger creates their profiles (role ADMIN) automatically;
-- this script promotes the owner and inserts demo rooms/tenant/contract/HR.
-- Safe to re-run (idempotent).
-- ============================================================================

do $$
declare
  owner_id uuid;
  admin_id uuid;
begin
  select id into owner_id from auth.users where email = 'owner@skm.local';
  select id into admin_id from auth.users where email = 'admin@skm.local';

  if owner_id is null or admin_id is null then
    raise exception 'Create owner@skm.local and admin@skm.local in Auth first.';
  end if;

  update public.profiles set role = 'OWNER', full_name = 'Owner (เจ้าของ)' where id = owner_id;
  update public.profiles set full_name = 'Admin (แอดมิน)' where id = admin_id;

  insert into public.admin_permissions (module, enabled, updated_by)
  values
    ('tenants', true, owner_id), ('rooms', true, owner_id), ('billing', true, owner_id),
    ('payments', true, owner_id), ('expenses', true, owner_id), ('reports', true, owner_id),
    ('moveouts', true, owner_id)
  on conflict (module) do nothing;

  insert into public.utility_rates (electricity_unit_rate, vat_rate, effective_from, created_by)
  values (8.0000, 0.0700, current_date, owner_id)
  on conflict do nothing;

  insert into public.rooms
    (room_number, floor, room_kind, rent_rate, water_billing_mode, water_rate, occupant_count, status, created_by)
  values
    ('101', 1, 'RESIDENTIAL', 3500.00, 'PER_PERSON', 100.00, 2, 'OCCUPIED',        admin_id),
    ('102', 1, 'RESIDENTIAL', 3500.00, 'PER_PERSON', 100.00, 0, 'VACANT',          admin_id),
    ('103', 1, 'RESIDENTIAL', 4000.00, 'PER_PERSON', 100.00, 0, 'VACANT',          admin_id),
    ('201', 2, 'RESIDENTIAL', 3800.00, 'PER_PERSON', 100.00, 1, 'PENDING_MOVEOUT', admin_id),
    ('202', 2, 'RESIDENTIAL', 3800.00, 'PER_PERSON', 100.00, 0, 'VACANT',          admin_id),
    ('S1',  1, 'SHOP',        9000.00, 'PER_UNIT',    18.00, 0, 'VACANT',          admin_id),
    ('S2',  1, 'SHOP',        9000.00, 'PER_UNIT',    18.00, 0, 'VACANT',          admin_id),
    ('S3',  1, 'SHOP',       12000.00, 'PER_UNIT',    18.00, 0, 'VACANT',          admin_id)
  on conflict (room_number) do nothing;

  -- tenant + contract on room 101 (only if not already present)
  if not exists (select 1 from public.tenants where full_name = 'สมชาย ใจดี') then
    insert into public.tenants (id, full_name, phone, co_tenant_name, created_by)
    values ('00000000-0000-0000-0000-0000000000c1', 'สมชาย ใจดี', '0812345678', 'สมหญิง ใจดี', admin_id);

    insert into public.contracts (
      tenant_id, room_id, occupant_count,
      advance_rent_amount, advance_rent_paid, damage_deposit_amount, damage_deposit_paid,
      start_date, status, created_by)
    select '00000000-0000-0000-0000-0000000000c1', r.id, 2,
           3500.00, 3500.00, 3500.00, 3500.00, current_date, 'ACTIVE', admin_id
    from public.rooms r where r.room_number = '101';
  end if;

  insert into public.staff_members (full_name, position, monthly_salary, active, created_by)
  select 'ผู้จัดการ (Manager)', 'Manager', 15000.00, true, owner_id
  where not exists (select 1 from public.staff_members where full_name = 'ผู้จัดการ (Manager)');
end $$;
