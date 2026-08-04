-- ============================================================================
-- Migration 0019: keep rooms/contracts in sync with move-outs.
--   * NOTIFIED (insert)      -> room becomes PENDING_MOVEOUT (🔵).
--   * COMPLETED / FLED       -> contract ENDED (which frees the room to VACANT
--                              via the existing contract trigger).
-- SECURITY DEFINER so an admin's NOTIFIED insert can flip the room even though
-- admins can't update rooms directly.
-- ============================================================================

create or replace function public.sync_on_moveout()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'NOTIFIED' then
    update public.rooms set status = 'PENDING_MOVEOUT'
      where id = (select room_id from public.contracts where id = new.contract_id);
  elsif tg_op = 'UPDATE'
        and new.status in ('COMPLETED', 'FLED')
        and old.status is distinct from new.status then
    update public.contracts set status = 'ENDED' where id = new.contract_id;
  end if;
  return new;
end;
$$;

drop trigger if exists moveouts_sync on public.move_outs;
create trigger moveouts_sync
  after insert or update on public.move_outs
  for each row execute function public.sync_on_moveout();
