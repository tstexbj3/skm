-- ============================================================================
-- Migration 0020: LINE auto-slip support.
--   * A verified bank slip is unique by its transaction ref — never count the
--     same transfer twice (replay / double-send protection). Partial unique
--     index so manual payments (null slip_ref) are unaffected.
--   * Speed up the room -> latest-payable-bill lookup the webhook does.
-- The webhook writes with the service-role key (server-only), bypassing RLS,
-- so no new RLS policy is required here. Owners read/approve LINE payments
-- through the existing payments policies.
-- ============================================================================

create unique index if not exists payments_slip_ref_key
  on public.payments (slip_ref)
  where slip_ref is not null;

create index if not exists bills_room_number_status_idx
  on public.bills (room_number, status);
