-- ============================================================================
-- Migration 0006: audit_logs — a permanent, append-only record of applied edits.
-- Owner edits (e.g. tenant info) write a row here with a field-level diff:
--   changes = { "<field>": { "old": ..., "new": ... }, ... }
-- Read by any staff; inserted by the editor; never updated or deleted.
-- ============================================================================

create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id  uuid not null,
  action     text not null default 'UPDATE',
  changes    jsonb not null default '{}'::jsonb,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);
create index on public.audit_logs (table_name, record_id, changed_at desc);

grant select, insert on public.audit_logs to authenticated;

alter table public.audit_logs enable row level security;

create policy "audit: staff read" on public.audit_logs for select to authenticated
  using (public.is_staff());
create policy "audit: staff insert" on public.audit_logs for insert to authenticated
  with check (public.is_staff() and changed_by = auth.uid());
