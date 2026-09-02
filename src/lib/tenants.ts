export const TENANT_BUCKET = "tenant-media";

export type Tenant = {
  id: string;
  full_name: string;
  phone: string | null;
  photo_url: string | null;
  national_id_image_url: string | null;
  co_tenant_name: string | null;
  co_tenant_national_id_image_url: string | null;
  created_at: string;
};

export type Contract = {
  id: string;
  tenant_id: string;
  room_id: string;
  contract_scan_urls: string[];
  occupant_count: number;
  advance_rent_amount: string;
  advance_rent_paid: string;
  damage_deposit_amount: string;
  damage_deposit_paid: string;
  start_date: string;
  status: "ACTIVE" | "ENDED";
};

/** A row for the tenants list: a contract joined with tenant + room. */
export type TenancyRow = {
  id: string;
  occupant_count: number;
  start_date: string;
  end_date: string | null;
  advance_rent_amount: string;
  damage_deposit_amount: string;
  tenant: { id: string; full_name: string; phone: string | null } | null;
  room: { room_number: string; floor: number } | null;
};
