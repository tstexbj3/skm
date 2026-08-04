-- ============================================================================
-- Migration 0005: keep a room in sync with its contract.
--   * Signing an ACTIVE contract -> room OCCUPIED + occupant_count copied over
--     (so per-person water occupants are filled automatically, no double entry).
--   * Ending a contract -> room VACANT + occupant_count 0.
-- Runs SECURITY DEFINER so an ADMIN insert can flip the room even though ADMIN
-- has no direct UPDATE on rooms.
-- Also: at most one ACTIVE contract per room.
-- ============================================================================

create or replace function public.sync_room_on_contract()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ACTIVE' then
    update public.rooms
      set status = 'OCCUPIED', occupant_count = new.occupant_count
      where id = new.room_id;
  elsif new.status = 'ENDED' then
    update public.rooms
      set status = 'VACANT', occupant_count = 0
      where id = new.room_id;
  end if;
  return new;
end;
$$;

drop trigger if exists contracts_sync_room on public.contracts;
create trigger contracts_sync_room
  after insert or update on public.contracts
  for each row execute function public.sync_room_on_contract();

-- One active contract per room.
create unique index if not exists contracts_one_active_per_room
  on public.contracts (room_id)
  where status = 'ACTIVE';
