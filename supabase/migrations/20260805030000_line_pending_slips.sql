-- ============================================================================
-- Migration 0023: hold slips from LINE accounts that aren't linked to a room.
-- The OA is a general support channel, so the bot must NOT surface everyone who
-- messages. It only reacts to confirmed bank slips: a slip from a LINKED account
-- records straight to its bill; a slip from an UNKNOWN account lands here for an
-- admin to assign (which also links the account for next time). Text and
-- non-slip photos are ignored entirely.
-- ============================================================================

create table if not exists public.line_pending_slips (
  id               uuid primary key default gen_random_uuid(),
  line_user_id     text not null,
  display_name     text,
  slip_ref         text not null unique,          -- dedupe with payments.slip_ref
  amount           numeric(12,2) not null,
  sender_name      text,
  bank             text,
  image_path       text,                          -- payment-slips bucket
  status           text not null default 'PENDING', -- PENDING | ASSIGNED | REJECTED
  assigned_bill_id uuid references public.bills(id),
  created_at       timestamptz not null default now(),
  handled_by       uuid references public.profiles(id),
  handled_at       timestamptz
);
create index if not exists line_pending_slips_status_idx
  on public.line_pending_slips (status);

grant select, update on public.line_pending_slips to authenticated;
alter table public.line_pending_slips enable row level security;

drop policy if exists "pending: staff read" on public.line_pending_slips;
create policy "pending: staff read" on public.line_pending_slips
  for select to authenticated using (public.is_staff());
drop policy if exists "pending: staff update" on public.line_pending_slips;
create policy "pending: staff update" on public.line_pending_slips
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- Assigning a pending slip also links the account (an INSERT into line_user_rooms),
-- so staff need insert there too.
grant insert on public.line_user_rooms to authenticated;
drop policy if exists "line_rooms: staff insert" on public.line_user_rooms;
create policy "line_rooms: staff insert" on public.line_user_rooms
  for insert to authenticated with check (public.is_staff());
