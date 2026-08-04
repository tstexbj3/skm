-- ============================================================================
-- SKM — Apartment / Dormitory Management (สุขเกษมแมนชั่น)
-- Migration 0001: initial schema, relationships, and RLS.
--
-- HARD RULES enforced here (see CLAUDE.md):
--   * Money is numeric — never float.
--   * Bills are IMMUTABLE SNAPSHOTS: rate values are copied onto the bill row.
--   * OWNER edits + approves everything. ADMIN creates records and proposes
--     edits, but every edit is STAGED as a change_request and only goes live
--     once OWNER approves — the before/after is kept forever.
--   * Owner controls, per MODULE, what ADMIN may do (admin_permissions), and
--     this gate is enforced in RLS via admin_can(), not just the UI.
--   * VOID (status), never DELETE. No DELETE grants / policies are issued.
--   * Workflows are explicit status state machines with an audit trail.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role          as enum ('ADMIN', 'OWNER');
create type public.room_kind          as enum ('RESIDENTIAL', 'SHOP');
create type public.room_status        as enum ('OCCUPIED', 'VACANT', 'PENDING_MOVEOUT'); -- 🔴/🟢/🔵
create type public.water_billing_mode as enum ('PER_PERSON', 'PER_UNIT');
create type public.contract_status    as enum ('ACTIVE', 'ENDED');
create type public.bill_status        as enum ('DRAFT', 'SENT', 'APPROVED', 'PRINTED');
create type public.line_item_status   as enum ('ACTIVE', 'VOID');
create type public.payment_method     as enum ('CASH', 'TRANSFER');
create type public.payment_source     as enum ('MANUAL', 'LINE_AUTO');
create type public.payment_status     as enum ('RECORDED', 'APPROVED', 'RECONCILED', 'VOID');
create type public.deposit_status     as enum ('PENDING', 'MATCHED', 'VOID');
create type public.expense_category   as enum
  ('SALARY', 'ELECTRICITY', 'WATER', 'DEPOSIT_RETURN', 'MAINTENANCE', 'INTERNET', 'OTHER');
create type public.expense_status     as enum ('PENDING_APPROVAL', 'APPROVED', 'VOID');
create type public.moveout_status     as enum ('NOTIFIED', 'APPROVED', 'COMPLETED', 'FLED');
create type public.report_kind        as enum ('ROOM_CHARGES', 'ROOM_STATUS');
create type public.change_status      as enum ('PENDING', 'APPROVED', 'REJECTED');

-- ---------------------------------------------------------------------------
-- Shared trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, carries the role
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  role       public.user_role not null default 'ADMIN',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'ADMIN')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so they bypass RLS on profiles / permissions)
-- ---------------------------------------------------------------------------
create or replace function public.current_role_name()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'OWNER');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN');
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- admin_permissions — OWNER-controlled, per-module switchboard for ADMIN.
-- Unset module defaults to allowed; OWNER disables explicitly.
-- ---------------------------------------------------------------------------
create table public.admin_permissions (
  module     text primary key,          -- tenants, rooms, billing, payments, expenses, reports, moveouts
  enabled    boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- OWNER: always allowed. ADMIN: allowed unless the module is explicitly disabled.
create or replace function public.admin_can(module_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.is_owner() then true
    when public.is_admin() then
      coalesce((select enabled from public.admin_permissions where module = module_key), true)
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- rooms — 48 rooms (45 RESIDENTIAL + 3 SHOP), per-room price and utility config
-- ---------------------------------------------------------------------------
create table public.rooms (
  id                 uuid primary key default gen_random_uuid(),
  room_number        text not null unique,
  floor              integer not null default 1,
  room_kind          public.room_kind not null default 'RESIDENTIAL',
  rent_rate          numeric(12,2) not null default 0,          -- per-room monthly rent
  -- Water: this building = 100 ฿/person; other places bill per unit.
  water_billing_mode public.water_billing_mode not null default 'PER_PERSON',
  water_rate         numeric(12,4) not null default 100,        -- ฿/person or ฿/unit (per mode)
  status             public.room_status not null default 'VACANT',
  note               text,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger rooms_set_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();
create index on public.rooms (floor);
create index on public.rooms (status);

-- ---------------------------------------------------------------------------
-- utility_rates — building-wide ELECTRICITY unit rate + VAT (effective-dated).
-- Water rate is per-room (rooms.water_rate). Bills SNAPSHOT whatever applies.
-- ---------------------------------------------------------------------------
create table public.utility_rates (
  id                    uuid primary key default gen_random_uuid(),
  electricity_unit_rate numeric(12,4) not null,
  vat_rate              numeric(6,4)  not null default 0.07,     -- 7% VAT
  effective_from        date not null,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tenants — captured once at contract signing
-- ---------------------------------------------------------------------------
create table public.tenants (
  id                              uuid primary key default gen_random_uuid(),
  full_name                       text not null,
  phone                           text,
  photo_url                       text,   -- tenant photo
  national_id_image_url           text,   -- tenant national ID card image
  co_tenant_name                  text,
  co_tenant_national_id_image_url text,
  created_by                      uuid references public.profiles(id),
  created_at                      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- contracts — tenant ↔ room, with the two deposit buckets:
--   advance_rent  = one month prepaid (covers the LAST month at move-out);
--                   tops up when rent increases.
--   damage_deposit = refundable if nothing broken; fixed at signing.
-- ---------------------------------------------------------------------------
create table public.contracts (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id),
  room_id              uuid not null references public.rooms(id),
  contract_scan_url    text,
  occupant_count       integer not null default 1,               -- for PER_PERSON water
  advance_rent_amount  numeric(12,2) not null default 0,         -- prepaid last month (adjusts up)
  advance_rent_paid    numeric(12,2) not null default 0,
  damage_deposit_amount numeric(12,2) not null default 0,        -- refundable, fixed
  damage_deposit_paid  numeric(12,2) not null default 0,
  start_date           date not null default current_date,
  status               public.contract_status not null default 'ACTIVE',
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger contracts_set_updated_at before update on public.contracts
  for each row execute function public.set_updated_at();
create index on public.contracts (tenant_id);
create index on public.contracts (room_id);

-- ---------------------------------------------------------------------------
-- recurring_charges — per-contract monthly add-ons (TV, fridge, ...). The bill
-- generator copies ACTIVE ones onto each month's bill as line items.
-- ---------------------------------------------------------------------------
create table public.recurring_charges (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  label       text not null,
  amount      numeric(12,2) not null default 0,
  active      boolean not null default true,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index on public.recurring_charges (contract_id);

-- ---------------------------------------------------------------------------
-- bills — IMMUTABLE SNAPSHOT. Mirrors the printed ใบแจ้งหนี้.
-- ---------------------------------------------------------------------------
create table public.bills (
  id                  uuid primary key default gen_random_uuid(),
  contract_id         uuid not null references public.contracts(id),
  room_id             uuid not null references public.rooms(id),

  status              public.bill_status not null default 'DRAFT',
  status_changed_at   timestamptz not null default now(),

  -- header
  bill_date           date not null,                         -- วันที่ (1st of month)
  billing_month       date not null,                         -- billing month/year
  payer_name          text not null,                         -- เรียน (snapshot)
  room_number         text not null,                         -- ห้อง (snapshot)

  -- ค่าเช่าห้องพัก (room rent)
  rent_amount         numeric(12,2) not null default 0,      -- snapshot of room rent

  -- ค่าน้ำ (water) — mode + rate snapshotted; per-person OR per-unit
  water_billing_mode  public.water_billing_mode not null default 'PER_PERSON',
  water_rate          numeric(12,4) not null default 0,      -- ฿/person or ฿/unit (snapshot)
  water_persons       integer not null default 1,            -- used when PER_PERSON
  water_start         numeric(12,2) not null default 0,      -- used when PER_UNIT (prev end)
  water_end           numeric(12,2) not null default 0,      -- used when PER_UNIT (manual)
  water_vat_rate      numeric(6,4)  not null default 0.07,   -- snapshot
  water_amount        numeric(12,2) not null default 0,

  -- ค่าไฟฟ้า (electricity) — building-wide unit rate, metered
  elec_unit_rate      numeric(12,4) not null default 0,      -- snapshot
  elec_start          numeric(12,2) not null default 0,      -- prev month end (auto)
  elec_end            numeric(12,2) not null default 0,      -- meter read on last day (manual)
  elec_vat_rate       numeric(6,4)  not null default 0.07,   -- snapshot
  elec_amount         numeric(12,2) not null default 0,

  -- ค่าปรับล่าช้า (late fee) ตั้งแต่วันที่ ___
  late_fee_since_date date,
  late_fee_amount     numeric(12,2) not null default 0,

  -- ค่าใช้จ่ายอื่นๆ (other charges)
  other_charge_label  text,
  other_charge_amount numeric(12,2) not null default 0,

  note                text,                                  -- หมายเหตุ

  -- รวม (total) = rent + water + elec + late_fee + other
  --               + ACTIVE bill_line_items flagged include_in_total (recurring add-ons)
  total_amount        numeric(12,2) not null default 0,

  received_by         text,                                  -- ผู้รับเงิน
  received_at         date,

  print_count         integer not null default 0,
  last_printed_at     timestamptz,

  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),

  unique (contract_id, billing_month)
);
create index on public.bills (contract_id);
create index on public.bills (room_id);
create index on public.bills (status);
create index on public.bills (billing_month);

-- ---------------------------------------------------------------------------
-- bill_line_items — voidable ad-hoc lines + materialized recurring add-ons.
-- ---------------------------------------------------------------------------
create table public.bill_line_items (
  id               uuid primary key default gen_random_uuid(),
  bill_id          uuid not null references public.bills(id) on delete cascade,
  label            text not null default '',
  amount           numeric(12,2) not null default 0,
  include_in_total boolean not null default true,
  source_recurring uuid references public.recurring_charges(id),  -- set if copied from a recurring add-on
  status           public.line_item_status not null default 'ACTIVE',
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  voided_by        uuid references public.profiles(id),
  voided_at        timestamptz
);
create index on public.bill_line_items (bill_id);

-- ---------------------------------------------------------------------------
-- cash_deposits — reconciliation of collected cash handed to the owner
-- ---------------------------------------------------------------------------
create table public.cash_deposits (
  id                    uuid primary key default gen_random_uuid(),
  deposit_slip_url      text,
  amount                numeric(12,2) not null,
  expected_cash_balance numeric(12,2) not null default 0,
  matched               boolean not null default false,
  status                public.deposit_status not null default 'PENDING',
  status_changed_at     timestamptz not null default now(),
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- payments — partial or full. Admin records; OWNER approves.
--   RECORDED -> APPROVED -> RECONCILED (or VOID)
-- source MANUAL now; LINE_AUTO carries verified slip data (phase: LINE slice).
-- ---------------------------------------------------------------------------
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  bill_id           uuid references public.bills(id),
  amount            numeric(12,2) not null,                     -- may be partial
  method            public.payment_method not null,             -- CASH | TRANSFER
  source            public.payment_source not null default 'MANUAL',
  slip_image_url    text,                                       -- transfer slip OR photo of cash

  -- verified slip data (populated by the LINE auto-slip flow)
  slip_ref          text,                                       -- bank transaction ref
  slip_sender       text,
  slip_bank         text,
  slip_verified_at  timestamptz,
  verified_amount   numeric(12,2),

  status            public.payment_status not null default 'RECORDED',
  status_changed_at timestamptz not null default now(),
  approved_by       uuid references public.profiles(id),
  approved_at       timestamptz,
  cash_deposit_id   uuid references public.cash_deposits(id),   -- set when cash is reconciled
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);
create index on public.payments (bill_id);
create index on public.payments (method);
create index on public.payments (status);
create index on public.payments (cash_deposit_id);

-- ---------------------------------------------------------------------------
-- staff_members — HR roster + salary rate. OWNER-ONLY (admin has NO access,
-- not even read). Salary is entered by the owner; see expenses SALARY rule.
-- ---------------------------------------------------------------------------
create table public.staff_members (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  position       text,
  monthly_salary numeric(12,2) not null default 0,
  active         boolean not null default true,
  note           text,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger staff_members_set_updated_at before update on public.staff_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- expenses — ALL spending. Admin records + attaches bill photo; OWNER approves.
-- If no bill photo, the UI warns "NO BILL ON THIS PAYMENT" and the owner
-- acknowledges (no_bill_ack) before approving.
--   PENDING_APPROVAL -> APPROVED (or VOID)
-- ---------------------------------------------------------------------------
create table public.expenses (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid references public.rooms(id),               -- null => common area
  is_common_area boolean not null default false,
  category       public.expense_category not null,               -- SALARY, ELECTRICITY, WATER, ...
  description    text not null default '',
  amount         numeric(12,2) not null default 0,
  bill_image_url text,                                           -- photo of the bill (may be null)
  item_image_url text,                                           -- photo of purchased item (maintenance/material)
  no_bill_ack    boolean not null default false,                -- owner acknowledged missing bill
  deduct_from_income boolean not null default false,            -- SALARY: owner may deduct from income
  staff_member_id uuid references public.staff_members(id),     -- HR: salary recipient (owner-only)
  moveout_id     uuid,                                           -- links DEPOSIT_RETURN to a move-out (FK added below)
  expense_date   date not null default current_date,
  status         public.expense_status not null default 'PENDING_APPROVAL',
  approved_by    uuid references public.profiles(id),
  approved_at    timestamptz,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
create index on public.expenses (room_id);
create index on public.expenses (category);
create index on public.expenses (status);

-- ---------------------------------------------------------------------------
-- move_outs — 30-day notice; admin calculates deposit return; OWNER approves.
--   NOTIFIED -> APPROVED -> COMPLETED   (or FLED for หนี)
-- advance_rent covers the last month; damage_deposit refunded minus deductions.
-- <30 days notice: red flag (deposit not refunded / ไม่คืนมัดจำ).
-- ---------------------------------------------------------------------------
create table public.move_outs (
  id                      uuid primary key default gen_random_uuid(),
  contract_id             uuid not null references public.contracts(id),
  notice_date             date not null default current_date,
  move_out_date           date not null,
  notice_days             integer generated always as (move_out_date - notice_date) stored,
  sufficient_notice       boolean generated always as ((move_out_date - notice_date) >= 30) stored,

  advance_rent_snapshot   numeric(12,2) not null default 0,      -- from contract at notice time
  damage_deposit_snapshot numeric(12,2) not null default 0,
  last_month_rent         numeric(12,2) not null default 0,      -- covered by advance
  advance_applied         numeric(12,2) not null default 0,
  damage_deductions       numeric(12,2) not null default 0,      -- 0 if nothing broken
  damage_deposit_refund   numeric(12,2) not null default 0,      -- deposit − deductions
  deposit_refunded        boolean not null default false,
  red_flag_no_refund      boolean not null default false,        -- <30 days => ไม่คืนมัดจำ
  fled                    boolean not null default false,         -- หนี

  status                  public.moveout_status not null default 'NOTIFIED',
  status_changed_at       timestamptz not null default now(),
  approved_by             uuid references public.profiles(id),
  approved_at             timestamptz,
  created_by              uuid references public.profiles(id),
  created_at              timestamptz not null default now()
);
create index on public.move_outs (contract_id);
create index on public.move_outs (status);

alter table public.expenses
  add constraint expenses_moveout_fk
  foreign key (moveout_id) references public.move_outs(id);

-- ---------------------------------------------------------------------------
-- change_requests — the edit-approval mechanism. ADMIN proposes an edit; the
-- live row is UNCHANGED until OWNER approves. before/after kept forever.
-- ---------------------------------------------------------------------------
create table public.change_requests (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,                                    -- e.g. 'contracts'
  record_id   uuid not null,
  before_data jsonb not null default '{}'::jsonb,               -- snapshot of the row before
  after_data  jsonb not null default '{}'::jsonb,               -- proposed values
  reason      text,
  status      public.change_status not null default 'PENDING',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index on public.change_requests (table_name, record_id);
create index on public.change_requests (status);

-- ---------------------------------------------------------------------------
-- report_summaries — saved back-office sheets
-- ---------------------------------------------------------------------------
create table public.report_summaries (
  id             uuid primary key default gen_random_uuid(),
  kind           public.report_kind not null,
  period_month   date not null,
  occupancy_rate numeric(6,4),
  data           jsonb not null default '{}'::jsonb,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
create index on public.report_summaries (kind, period_month);

-- ============================================================================
-- ROW-LEVEL SECURITY
--   * SELECT : any staff (ADMIN or OWNER).
--   * INSERT : admin_can('<module>') — OWNER always; ADMIN if module enabled.
--   * UPDATE : OWNER only (approvals + edits). ADMIN never edits live rows;
--              it proposes edits via change_requests instead.
--       Exception: ADMIN may edit a bill while DRAFT (fill/send) — that is how
--       a bill is created, not an edit of an issued record.
--   * DELETE : denied everywhere. Use VOID / status.
-- ============================================================================

grant usage on schema public to anon, authenticated;
grant select, insert, update on all tables in schema public to authenticated;

alter table public.profiles          enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.rooms             enable row level security;
alter table public.utility_rates     enable row level security;
alter table public.tenants           enable row level security;
alter table public.contracts         enable row level security;
alter table public.recurring_charges enable row level security;
alter table public.bills             enable row level security;
alter table public.bill_line_items   enable row level security;
alter table public.cash_deposits     enable row level security;
alter table public.payments          enable row level security;
alter table public.staff_members     enable row level security;
alter table public.expenses          enable row level security;
alter table public.move_outs         enable row level security;
alter table public.change_requests   enable row level security;
alter table public.report_summaries  enable row level security;

-- ---- profiles ----
create policy "profiles: self or owner read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_owner());
create policy "profiles: owner update" on public.profiles for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---- admin_permissions (owner-only writes) ----
create policy "perms: staff read" on public.admin_permissions for select to authenticated
  using (public.is_staff());
create policy "perms: owner insert" on public.admin_permissions for insert to authenticated
  with check (public.is_owner());
create policy "perms: owner update" on public.admin_permissions for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---- rooms ----
create policy "rooms: staff read" on public.rooms for select to authenticated
  using (public.is_staff());
create policy "rooms: create" on public.rooms for insert to authenticated
  with check (public.admin_can('rooms') and created_by = auth.uid());
create policy "rooms: owner update" on public.rooms for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---- utility_rates ----
create policy "rates: staff read" on public.utility_rates for select to authenticated
  using (public.is_staff());
create policy "rates: create" on public.utility_rates for insert to authenticated
  with check (public.admin_can('billing') and created_by = auth.uid());
create policy "rates: owner update" on public.utility_rates for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---- tenants ----
create policy "tenants: staff read" on public.tenants for select to authenticated
  using (public.is_staff());
create policy "tenants: create" on public.tenants for insert to authenticated
  with check (public.admin_can('tenants') and created_by = auth.uid());
create policy "tenants: owner update" on public.tenants for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---- contracts ----
create policy "contracts: staff read" on public.contracts for select to authenticated
  using (public.is_staff());
create policy "contracts: create" on public.contracts for insert to authenticated
  with check (public.admin_can('tenants') and created_by = auth.uid());
create policy "contracts: owner update" on public.contracts for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---- recurring_charges ----
create policy "recurring: staff read" on public.recurring_charges for select to authenticated
  using (public.is_staff());
create policy "recurring: create" on public.recurring_charges for insert to authenticated
  with check (public.admin_can('billing') and created_by = auth.uid());
create policy "recurring: owner update" on public.recurring_charges for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---- bills ----
create policy "bills: staff read" on public.bills for select to authenticated
  using (public.is_staff());
create policy "bills: create" on public.bills for insert to authenticated
  with check (public.admin_can('billing') and created_by = auth.uid() and status = 'DRAFT');
create policy "bills: owner update" on public.bills for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy "bills: admin update while draft" on public.bills for update to authenticated
  using (public.is_admin() and public.admin_can('billing') and status = 'DRAFT')
  with check (public.is_admin() and status in ('DRAFT', 'SENT'));

-- ---- bill_line_items ----
create policy "line_items: staff read" on public.bill_line_items for select to authenticated
  using (public.is_staff());
create policy "line_items: create" on public.bill_line_items for insert to authenticated
  with check (public.admin_can('billing') and created_by = auth.uid());
create policy "line_items: owner update" on public.bill_line_items for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy "line_items: admin update while bill draft"
  on public.bill_line_items for update to authenticated
  using (public.is_admin() and exists (
    select 1 from public.bills b where b.id = bill_id and b.status = 'DRAFT'))
  with check (public.is_admin());

-- ---- cash_deposits ----
create policy "deposits: staff read" on public.cash_deposits for select to authenticated
  using (public.is_staff());
create policy "deposits: create" on public.cash_deposits for insert to authenticated
  with check (public.admin_can('payments') and created_by = auth.uid());
create policy "deposits: owner update" on public.cash_deposits for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---- payments ----
create policy "payments: staff read" on public.payments for select to authenticated
  using (public.is_staff());
create policy "payments: create" on public.payments for insert to authenticated
  with check (public.admin_can('payments') and created_by = auth.uid() and status = 'RECORDED');
create policy "payments: owner update" on public.payments for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---- staff_members (HR) — OWNER ONLY, admin has no access at all ----
create policy "hr: owner read" on public.staff_members for select to authenticated
  using (public.is_owner());
create policy "hr: owner insert" on public.staff_members for insert to authenticated
  with check (public.is_owner());
create policy "hr: owner update" on public.staff_members for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---- expenses ----
create policy "expenses: staff read" on public.expenses for select to authenticated
  using (public.is_staff());
-- ADMIN may create non-salary expenses (if the module is enabled); SALARY is
-- OWNER-ONLY (HR). OWNER may create any category.
create policy "expenses: create" on public.expenses for insert to authenticated
  with check (
    public.admin_can('expenses')
    and created_by = auth.uid()
    and status = 'PENDING_APPROVAL'
    and (category <> 'SALARY' or public.is_owner())
  );
create policy "expenses: owner update" on public.expenses for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---- move_outs (ADMIN notifies; OWNER approves) ----
create policy "moveouts: staff read" on public.move_outs for select to authenticated
  using (public.is_staff());
create policy "moveouts: create" on public.move_outs for insert to authenticated
  with check (public.admin_can('moveouts') and created_by = auth.uid() and status = 'NOTIFIED');
create policy "moveouts: owner update" on public.move_outs for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---- change_requests (ADMIN proposes edits; OWNER approves/rejects) ----
create policy "changes: staff read" on public.change_requests for select to authenticated
  using (public.is_staff());
create policy "changes: staff propose" on public.change_requests for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid() and status = 'PENDING');
create policy "changes: owner review" on public.change_requests for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---- report_summaries ----
create policy "reports: staff read" on public.report_summaries for select to authenticated
  using (public.is_staff());
create policy "reports: create" on public.report_summaries for insert to authenticated
  with check (public.admin_can('reports') and created_by = auth.uid());
create policy "reports: owner update" on public.report_summaries for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
