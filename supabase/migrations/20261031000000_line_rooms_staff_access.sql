-- ============================================================================
-- Migration 0025: staff read/update on line_user_rooms.
-- The new /line-slips triage page lets staff assign a held slip to a room,
-- which upserts the LINE-account -> room link (insert policy exists from
-- migration 0023; upsert also needs select + update).
-- ============================================================================

grant select, update on public.line_user_rooms to authenticated;

drop policy if exists "line_rooms: staff read" on public.line_user_rooms;
create policy "line_rooms: staff read" on public.line_user_rooms
  for select to authenticated using (public.is_staff());

drop policy if exists "line_rooms: staff update" on public.line_user_rooms;
create policy "line_rooms: staff update" on public.line_user_rooms
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
