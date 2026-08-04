-- ============================================================================
-- Storage buckets (CLOUD). Run once in the Supabase SQL Editor.
-- Creates the 3 PRIVATE buckets and RLS on storage.objects so only signed-in
-- staff can read/upload. No delete (VOID-not-delete philosophy). Idempotent.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('tenant-media',  'tenant-media',  false),
  ('payment-slips', 'payment-slips', false),
  ('expense-media', 'expense-media', false)
on conflict (id) do nothing;

-- Authenticated users (owner/admin) may read files in the app buckets.
drop policy if exists "app buckets: staff read" on storage.objects;
create policy "app buckets: staff read" on storage.objects for select to authenticated
  using (bucket_id in ('tenant-media', 'payment-slips', 'expense-media'));

-- ...and upload into them.
drop policy if exists "app buckets: staff upload" on storage.objects;
create policy "app buckets: staff upload" on storage.objects for insert to authenticated
  with check (bucket_id in ('tenant-media', 'payment-slips', 'expense-media'));

-- ...and replace/rename their own uploads (needed for re-uploads).
drop policy if exists "app buckets: staff update" on storage.objects;
create policy "app buckets: staff update" on storage.objects for update to authenticated
  using (bucket_id in ('tenant-media', 'payment-slips', 'expense-media'))
  with check (bucket_id in ('tenant-media', 'payment-slips', 'expense-media'));
