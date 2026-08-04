-- ============================================================================
-- Migration 0017: the payment-qr bucket had INSERT/UPDATE policies but no
-- SELECT policy. Uploading with upsert does a SELECT existence check first,
-- which RLS then rejects. Add the authenticated SELECT policy (public bucket,
-- so this only affects the authenticated upload path).
-- ============================================================================

drop policy if exists "qr: auth read" on storage.objects;
create policy "qr: auth read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-qr');
