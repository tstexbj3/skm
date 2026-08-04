-- ============================================================================
-- Migration 0016: fix QR upload. Storage RLS policies that call a custom
-- function (is_staff()) get rejected in the storage evaluation context. Use a
-- plain bucket-id check (same pattern as the working app-media buckets). The
-- payment-qr bucket is public and holds only non-secret QR codes, so any
-- authenticated user may upload.
-- ============================================================================

drop policy if exists "qr: staff insert" on storage.objects;
drop policy if exists "qr: staff update" on storage.objects;
drop policy if exists "qr: staff delete" on storage.objects;
drop policy if exists "qr: owner insert" on storage.objects;
drop policy if exists "qr: owner update" on storage.objects;
drop policy if exists "qr: owner delete" on storage.objects;

create policy "qr: auth insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-qr');
create policy "qr: auth update" on storage.objects for update to authenticated
  using (bucket_id = 'payment-qr') with check (bucket_id = 'payment-qr');
create policy "qr: auth delete" on storage.objects for delete to authenticated
  using (bucket_id = 'payment-qr');
