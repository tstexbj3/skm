"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { signTenant, type SignState } from "@/app/(app)/tenants/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type VacantRoom = {
  id: string;
  room_number: string;
  floor: number;
  rent_rate: string;
};

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const fileClass =
  "block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:py-1 file:text-sm file:font-medium hover:file:bg-accent";

export function SignTenantForm({ rooms }: { rooms: VacantRoom[] }) {
  const t = useTranslations("tenants");
  const [state, formAction, pending] = useActionState<SignState, FormData>(
    signTenant,
    {}
  );

  const today = new Date().toISOString().slice(0, 10);
  const [advAmount, setAdvAmount] = useState("");
  const [advPaid, setAdvPaid] = useState("");
  const [depAmount, setDepAmount] = useState("");
  const [depPaid, setDepPaid] = useState("");

  function onRoomChange(id: string) {
    const r = rooms.find((x) => x.id === id);
    const rent = r ? String(Number(r.rent_rate)) : "";
    // Prefill: advance rent = one month; damage deposit = one month (editable).
    setAdvAmount(rent);
    setAdvPaid(rent);
    setDepAmount(rent);
    setDepPaid(rent);
  }

  const errorMsg = state.error
    ? t.has(`errors.${state.error}`)
      ? t(`errors.${state.error}`)
      : state.error
    : null;

  return (
    <form action={formAction} className="space-y-6">
      {/* Room + tenancy basics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("tenancy")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="room_id">{t("room")}</Label>
            <select
              id="room_id"
              name="room_id"
              required
              className={selectClass}
              defaultValue=""
              onChange={(e) => onRoomChange(e.target.value)}
            >
              <option value="" disabled>
                {t("selectRoom")}
              </option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {t("floorRoom", { floor: r.floor, room: r.room_number })} · ฿
                  {Number(r.rent_rate).toLocaleString()}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="start_date">{t("startDate")}</Label>
            <Input
              id="start_date"
              name="start_date"
              type="date"
              defaultValue={today}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="occupant_count">{t("occupants")}</Label>
            <Input
              id="occupant_count"
              name="occupant_count"
              type="number"
              min={1}
              step={1}
              defaultValue={1}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="term_months">{t("termMonths")}</Label>
            <Input
              id="term_months"
              name="term_months"
              type="number"
              min={1}
              step={1}
              defaultValue={12}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tenant */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("tenantInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="full_name">{t("fullName")}</Label>
            <Input id="full_name" name="full_name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{t("phone")}</Label>
            <Input id="phone" name="phone" type="tel" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="photo">{t("photo")}</Label>
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/*"
              className={fileClass}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="national_id">{t("nationalId")}</Label>
            <input
              id="national_id"
              name="national_id"
              type="file"
              accept="image/*"
              className={fileClass}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co_tenant_name">{t("coTenantName")}</Label>
            <Input id="co_tenant_name" name="co_tenant_name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co_tenant_national_id">{t("coTenantId")}</Label>
            <input
              id="co_tenant_national_id"
              name="co_tenant_national_id"
              type="file"
              accept="image/*"
              className={fileClass}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="contract_scan">{t("contractScan")}</Label>
            <input
              id="contract_scan"
              name="contract_scan"
              type="file"
              accept="image/*"
              className={fileClass}
            />
          </div>
        </CardContent>
      </Card>

      {/* Deposits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("deposits")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="advance_rent_amount">{t("advanceAmount")}</Label>
            <Input
              id="advance_rent_amount"
              name="advance_rent_amount"
              type="number"
              min={0}
              step="any"
              value={advAmount}
              onChange={(e) => setAdvAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="advance_rent_paid">{t("advancePaid")}</Label>
            <Input
              id="advance_rent_paid"
              name="advance_rent_paid"
              type="number"
              min={0}
              step="any"
              value={advPaid}
              onChange={(e) => setAdvPaid(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="damage_deposit_amount">{t("depositAmount")}</Label>
            <Input
              id="damage_deposit_amount"
              name="damage_deposit_amount"
              type="number"
              min={0}
              step="any"
              value={depAmount}
              onChange={(e) => setDepAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="damage_deposit_paid">{t("depositPaid")}</Label>
            <Input
              id="damage_deposit_paid"
              name="damage_deposit_paid"
              type="number"
              min={0}
              step="any"
              value={depPaid}
              onChange={(e) => setDepPaid(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? t("signing") : t("sign")}
        </Button>
      </div>
    </form>
  );
}
