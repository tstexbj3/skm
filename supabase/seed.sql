-- ============================================================================
-- Local seed data. Runs (as superuser, so RLS is bypassed) on `supabase db reset`.
-- LOCAL DEV ONLY — do not run against a production project.
--
-- Test logins (password for both: "password123"):
--   owner@skm.local  -> OWNER  (edit + approve everything)
--   admin@skm.local  -> ADMIN  (create + propose edits; owner approves)
--
-- Only a representative handful of rooms is seeded here; the owner enters the
-- full 48-room grid (45 residential + 3 shops) through the Rooms UI.
-- ============================================================================

do $$
declare
  owner_id uuid := '00000000-0000-0000-0000-000000000001';
  admin_id uuid := '00000000-0000-0000-0000-000000000002';
begin
  -- ---- auth users ---------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values
    ('00000000-0000-0000-0000-000000000000', owner_id, 'authenticated', 'authenticated',
     'owner@skm.local', extensions.crypt('password123', extensions.gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Owner (เจ้าของ)"}'),
    ('00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
     'admin@skm.local', extensions.crypt('password123', extensions.gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Admin (แอดมิน)"}')
  on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  )
  values
    (owner_id, owner_id,
     format('{"sub":"%s","email":"owner@skm.local"}', owner_id)::jsonb,
     'email', owner_id::text, now(), now(), now()),
    (admin_id, admin_id,
     format('{"sub":"%s","email":"admin@skm.local"}', admin_id)::jsonb,
     'email', admin_id::text, now(), now(), now())
  on conflict do nothing;

  -- profiles were auto-created (role ADMIN) by the trigger; promote the owner.
  update public.profiles set role = 'OWNER', full_name = 'Owner (เจ้าของ)' where id = owner_id;
  update public.profiles set full_name = 'Admin (แอดมิน)' where id = admin_id;

  -- ---- admin module permissions (all enabled by default) ------------------
  insert into public.admin_permissions (module, enabled, updated_by)
  values
    ('tenants', true, owner_id), ('rooms', true, owner_id), ('billing', true, owner_id),
    ('payments', true, owner_id), ('expenses', true, owner_id), ('reports', true, owner_id),
    ('moveouts', true, owner_id)
  on conflict (module) do nothing;

  -- ---- building-wide electricity rate + VAT -------------------------------
  insert into public.utility_rates (electricity_unit_rate, vat_rate, effective_from, created_by)
  values (8.0000, 0.0700, current_date, owner_id);

  -- ---- rooms (representative sample; water 100฿/person for residential) ----
  insert into public.rooms
    (id, room_number, floor, room_kind, rent_rate, water_billing_mode, water_rate, occupant_count, status, created_by)
  values
    ('00000000-0000-0000-0000-0000000000a1', '101', 1, 'RESIDENTIAL', 3500.00, 'PER_PERSON', 100.00, 2, 'OCCUPIED',        admin_id),
    ('00000000-0000-0000-0000-0000000000a2', '102', 1, 'RESIDENTIAL', 3500.00, 'PER_PERSON', 100.00, 0, 'VACANT',          admin_id),
    ('00000000-0000-0000-0000-0000000000a3', '103', 1, 'RESIDENTIAL', 4000.00, 'PER_PERSON', 100.00, 0, 'VACANT',          admin_id),
    ('00000000-0000-0000-0000-0000000000a4', '201', 2, 'RESIDENTIAL', 3800.00, 'PER_PERSON', 100.00, 1, 'PENDING_MOVEOUT', admin_id),
    ('00000000-0000-0000-0000-0000000000a5', '202', 2, 'RESIDENTIAL', 3800.00, 'PER_PERSON', 100.00, 0, 'VACANT',          admin_id),
    -- 3 shop units (billed water by unit to exercise the other mode)
    ('00000000-0000-0000-0000-0000000000b1', 'S1',  1, 'SHOP',        9000.00, 'PER_UNIT',    18.00, 0, 'VACANT',          admin_id),
    ('00000000-0000-0000-0000-0000000000b2', 'S2',  1, 'SHOP',        9000.00, 'PER_UNIT',    18.00, 0, 'VACANT',          admin_id),
    ('00000000-0000-0000-0000-0000000000b3', 'S3',  1, 'SHOP',       12000.00, 'PER_UNIT',    18.00, 0, 'VACANT',          admin_id)
  on conflict (id) do nothing;

  -- ---- tenant + contract (room 101), 2 occupants --------------------------
  insert into public.tenants (id, full_name, phone, co_tenant_name, created_by)
  values ('00000000-0000-0000-0000-0000000000c1', 'สมชาย ใจดี', '0812345678', 'สมหญิง ใจดี', admin_id)
  on conflict (id) do nothing;

  insert into public.contracts (
    id, tenant_id, room_id, occupant_count,
    advance_rent_amount, advance_rent_paid,
    damage_deposit_amount, damage_deposit_paid,
    start_date, status, created_by
  )
  values (
    '00000000-0000-0000-0000-0000000000d1',
    '00000000-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-0000000000a1',
    2,
    3500.00, 3500.00,     -- advance = one month rent
    3500.00, 3500.00,     -- damage deposit
    current_date, 'ACTIVE', admin_id)
  on conflict (id) do nothing;

  -- ---- a recurring monthly add-on (fridge) --------------------------------
  insert into public.recurring_charges (contract_id, label, amount, active, created_by)
  values ('00000000-0000-0000-0000-0000000000d1', 'ค่าเช่าตู้เย็น (fridge)', 100.00, true, admin_id)
  on conflict do nothing;

  -- ---- HR: staff roster (OWNER-only module) -------------------------------
  insert into public.staff_members (full_name, position, monthly_salary, active, created_by)
  values ('ผู้จัดการ (Manager)', 'Manager', 15000.00, true, owner_id)
  on conflict do nothing;
end $$;
