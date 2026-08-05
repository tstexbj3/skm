-- ============================================================================
-- Migration 0021: remember each LINE user's room number.
-- LINE delivers a text message (the room number) and a slip image as SEPARATE
-- webhook calls, so the room can't be held in request memory. Persist the last
-- room a user typed; a later slip image looks it up. Written by the
-- service-role webhook (bypasses RLS); locked to everyone else.
-- ============================================================================

create table if not exists public.line_user_rooms (
  user_id    text primary key,
  room       text not null,
  updated_at timestamptz not null default now()
);

alter table public.line_user_rooms enable row level security;
grant select, insert, update on public.line_user_rooms to service_role;
