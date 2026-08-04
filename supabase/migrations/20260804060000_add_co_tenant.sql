-- ============================================================================
-- Migration 0008: add_co_tenant() — a scoped capability so ADMIN can ADD a
-- co-tenant (ผู้เช่าร่วม) to an existing tenant without gaining edit rights on
-- anything else. RLS is row-level and can't restrict which columns an admin
-- updates, so this SECURITY DEFINER function does it safely:
--   * caller must pass admin_can('tenants') (owner always; admin if enabled);
--   * ADMIN may only ADD (when no co-tenant is set yet) — not overwrite;
--   * OWNER may set/replace it any time (they also have the full edit dialog).
-- Only the two co-tenant columns are ever written.
-- ============================================================================

create or replace function public.add_co_tenant(
  p_tenant_id uuid,
  p_name text,
  p_image_url text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_existing text;
begin
  if not public.admin_can('tenants') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select co_tenant_name into v_existing
  from public.tenants where id = p_tenant_id;

  if not public.is_owner() and coalesce(v_existing, '') <> '' then
    raise exception 'co_tenant_exists' using errcode = 'P0001';
  end if;

  update public.tenants
    set co_tenant_name = p_name,
        co_tenant_national_id_image_url =
          coalesce(p_image_url, co_tenant_national_id_image_url)
    where id = p_tenant_id;
end;
$$;

grant execute on function public.add_co_tenant(uuid, text, text) to authenticated;
