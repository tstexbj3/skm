-- ============================================================================
-- Migration 0022: admin links each tenant's LINE account to a room.
-- The webhook records every LINE user who messages the OA (with their display
-- name); an admin then assigns the room in the app. Slips from a linked account
-- auto-record to that room's bill. Staff read; staff (owner/admin) link.
-- ============================================================================

alter table public.line_user_rooms
  add column if not exists display_name text,
  add column if not exists linked_by uuid references public.profiles(id),
  add column if not exists linked_at timestamptz;

grant select, update on public.line_user_rooms to authenticated;

drop policy if exists "line_rooms: staff read" on public.line_user_rooms;
create policy "line_rooms: staff read" on public.line_user_rooms
  for select to authenticated using (public.is_staff());

drop policy if exists "line_rooms: staff link" on public.line_user_rooms;
create policy "line_rooms: staff link" on public.line_user_rooms
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
