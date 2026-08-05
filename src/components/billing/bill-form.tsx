"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateBill } from "@/app/(app)/billing/actions";
import {
  computeWater,
  computeElectricity,
  computeTotal,
  meterUnits,
  n,
  formatMoney2,
} from "@/lib/billing";
import type { WaterMode } from "@/lib/rooms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type BillData = {
  id: string;
  status: string;
  bill_date: string;
  billing_month: string;
  payer_name: string;
  room_number: string;
  rent_amount: string;
  water_billing_mode: WaterMode;
  water_rate: string;
  water_persons: number;
  water_start: string;
  water_end: string;
  water_vat_rate: string;
  water_amount: string;
  elec_unit_rate: string;
  elec_start: string;
  elec_end: string;
  elec_vat_rate: string;
  elec_amount: string;
  elec_min_charge: string;
  meter_digits: number;
  elec_is_manual: boolean;
  late_fee_since_date: string | null;
  late_fee_amount: string;
  other_charge_label: string | null;
  other_charge_amount: string;
  note: string | null;
  received_by: string | null;
  payment_account_id: string | null;
  total_amount: string;
};

export type LineItem = { id: string; label: string; amount: string; status: string };
export type AccountOption = { id: string; label: string };

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function BillForm({
  bill,
  lineItems,
  accounts,
  editable,
}: {
  bill: BillData;
  lineItems: LineItem[];
  accounts: AccountOption[];
  editable: boolean;
}) {
  const t = useTranslations("billing");
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const mode = bill.water_billing_mode;
  const lineItemsTotal = lineItems
    .filter((i) => i.status === "ACTIVE")
    .reduce((s, i) => s + n(i.amount), 0);

  const digits = n(bill.meter_digits);
  const elecMin = n(bill.elec_min_charge);
  const [persons, setPersons] = useState(bill.water_persons ?? 0);
  const [waterStart, setWaterStart] = useState(n(bill.water_start));
  const [waterEnd, setWaterEnd] = useState(n(bill.water_end));
  const [elecStart, setElecStart] = useState(n(bill.elec_start));
  const [elecEnd, setElecEnd] = useState(n(bill.elec_end));
  const [isManual, setIsManual] = useState(Boolean(bill.elec_is_manual));
  const [manualAmount, setManualAmount] = useState(
    bill.elec_is_manual ? n(bill.elec_amount) : 0
  );
  const [lateFee, setLateFee] = useState(n(bill.late_fee_amount));
  const [otherAmount, setOtherAmount] = useState(n(bill.other_charge_amount));

  const waterLive = editable
    ? computeWater({
        mode,
        rate: n(bill.water_rate),
        persons,
        start: waterStart,
        end: waterEnd,
        vat: n(bill.water_vat_rate),
        digits,
      })
    : n(bill.water_amount);
  const elecLive = editable
    ? computeElectricity({
        start: elecStart,
        end: elecEnd,
        rate: n(bill.elec_unit_rate),
        vat: n(bill.elec_vat_rate),
        digits,
        minCharge: elecMin,
        manualAmount: isManual ? manualAmount : null,
      })
    : n(bill.elec_amount);
  const totalLive = editable
    ? computeTotal({
        rent: n(bill.rent_amount),
        water: waterLive,
        electricity: elecLive,
        lateFee,
        other: otherAmount,
        lineItems: lineItemsTotal,
      })
    : n(bill.total_amount);

  function onSubmit(formData: FormData) {
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const res = await updateBill({}, formData);
      setSaving(false);
      if (res.ok) setSavedAt(Date.now());
      else setError(res.error ?? "error");
    });
  }

  const elecUnits = meterUnits(elecStart, elecEnd, digits);

  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="id" value={bill.id} />

      {/* Header */}
      <div className="grid grid-cols-2 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-3">
        <Info label={t("billDate")}>{bill.bill_date}</Info>
        <Info label={t("payer")}>{bill.payer_name}</Info>
        <Info label={t("room")}>{bill.room_number}</Info>
      </div>

      {/* Charge rows */}
      <div className="divide-y rounded-lg border bg-card">
        <Row label={t("rent")}>
          <Amount value={n(bill.rent_amount)} />
        </Row>

        {/* Water */}
        <Row
          label={t("water")}
          sub={
            mode === "PER_PERSON"
              ? t("perPersonAt", { rate: formatMoney2(n(bill.water_rate)) })
              : mode === "FLAT"
                ? t("flatWater")
                : t("perUnitAt", { rate: formatMoney2(n(bill.water_rate)) })
          }
        >
          {editable && mode === "PER_PERSON" && (
            <Field label={t("persons")}>
              <NumInput value={persons} name="water_persons" onChange={setPersons} step={1} />
            </Field>
          )}
          {editable && mode === "PER_UNIT" && (
            <MeterInputs
              startValue={waterStart}
              endValue={waterEnd}
              startName="water_start"
              name="water_end"
              onStart={setWaterStart}
              onEnd={setWaterEnd}
              startLabel={t("meterStart")}
              endLabel={t("meterEnd")}
            />
          )}
          {!editable && mode === "PER_PERSON" && (
            <span className="text-sm text-muted-foreground">
              {bill.water_persons} {t("personsShort")}
            </span>
          )}
          {!editable && mode === "PER_UNIT" && (
            <span className="text-sm text-muted-foreground">
              {n(bill.water_start)} – {n(bill.water_end)}
            </span>
          )}
          {/* keep persons submitted for non-per-person too */}
          {editable && mode !== "PER_PERSON" && (
            <input type="hidden" name="water_persons" value={persons} />
          )}
          {editable && mode !== "PER_UNIT" && (
            <input type="hidden" name="water_end" value={waterEnd} />
          )}
          <Amount value={waterLive} />
        </Row>

        {/* Electricity */}
        <Row
          label={t("electricity")}
          sub={
            editable
              ? `${t("perUnitAt", { rate: formatMoney2(n(bill.elec_unit_rate)) })} · ${t("minCharge")} ฿${formatMoney2(elecMin)}`
              : t("perUnitAt", { rate: formatMoney2(n(bill.elec_unit_rate)) })
          }
        >
          {editable && (
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                name="elec_is_manual"
                checked={isManual}
                onChange={(e) => setIsManual(e.target.checked)}
              />
              {t("manualElec")}
            </label>
          )}
          {editable && isManual && (
            <>
              <MeterInputs
                startValue={elecStart}
                endValue={elecEnd}
                startName="elec_start"
                name="elec_end"
                onStart={setElecStart}
                onEnd={setElecEnd}
                startLabel={t("meterStart")}
                endLabel={t("latestReading")}
              />
              <Field label={t("amount")}>
                <NumInput
                  value={manualAmount}
                  name="elec_manual_amount"
                  onChange={setManualAmount}
                />
              </Field>
            </>
          )}
          {editable && !isManual && (
            <>
              <MeterInputs
                startValue={elecStart}
                endValue={elecEnd}
                startName="elec_start"
                name="elec_end"
                onStart={setElecStart}
                onEnd={setElecEnd}
                startLabel={t("meterStart")}
                endLabel={t("meterEnd")}
              />
              <span className="text-xs text-muted-foreground">
                {elecUnits} {t("units")}
              </span>
              <input type="hidden" name="elec_manual_amount" value={manualAmount} />
            </>
          )}
          {!editable && (
            <span className="text-sm text-muted-foreground">
              {bill.elec_is_manual
                ? t("manualElec")
                : `${n(bill.elec_start)} – ${n(bill.elec_end)}`}
            </span>
          )}
          <Amount value={elecLive} />
        </Row>

        {/* Late fee */}
        <Row label={t("lateFee")}>
          {editable ? (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                name="late_fee_since_date"
                defaultValue={bill.late_fee_since_date ?? ""}
                className="h-8 w-40"
              />
              <NumInput value={lateFee} name="late_fee_amount" onChange={setLateFee} />
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              {bill.late_fee_since_date ?? ""}
            </span>
          )}
          <Amount value={editable ? lateFee : n(bill.late_fee_amount)} />
        </Row>

        {/* Other */}
        <Row label={t("other")}>
          {editable ? (
            <div className="flex items-center gap-2">
              <Input
                name="other_charge_label"
                defaultValue={bill.other_charge_label ?? ""}
                placeholder={t("otherLabel")}
                className="h-8 w-48"
              />
              <NumInput value={otherAmount} name="other_charge_amount" onChange={setOtherAmount} />
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              {bill.other_charge_label ?? ""}
            </span>
          )}
          <Amount value={editable ? otherAmount : n(bill.other_charge_amount)} />
        </Row>

        {/* Recurring / line items */}
        {lineItems
          .filter((i) => i.status === "ACTIVE")
          .map((i) => (
            <Row key={i.id} label={i.label}>
              <Amount value={n(i.amount)} />
            </Row>
          ))}

        {/* Total */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-base font-semibold">{t("grandTotal")}</span>
          <span className="text-lg font-bold">฿{formatMoney2(totalLive)}</span>
        </div>
      </div>

      {/* Note + payee + payment account */}
      <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
        {editable && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="payment_account_id">{t("paymentAccount")}</Label>
            <select
              id="payment_account_id"
              name="payment_account_id"
              defaultValue={bill.payment_account_id ?? ""}
              className={selectClass}
            >
              <option value="">{t("none")}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="note">{t("note")}</Label>
          {editable ? (
            <Input id="note" name="note" defaultValue={bill.note ?? ""} />
          ) : (
            <p className="text-sm">{bill.note ?? "—"}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="received_by">{t("receivedBy")}</Label>
          {editable ? (
            <Input
              id="received_by"
              name="received_by"
              defaultValue={bill.received_by ?? ""}
            />
          ) : (
            <p className="text-sm">{bill.received_by ?? "—"}</p>
          )}
        </div>
      </div>

      {editable && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {t("saveDraft")}
          </Button>
          {savedAt && !error && (
            <span className="text-sm text-emerald-600">{t("saved")}</span>
          )}
          {error && (
            <span className="text-sm text-destructive">
              {t.has(`errors.${error}`) ? t(`errors.${error}`) : error}
            </span>
          )}
        </div>
      )}
    </form>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}

function Row({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-32">
        <div className="text-sm font-medium">{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function NumInput({
  value,
  name,
  onChange,
  step = "any",
}: {
  value: number;
  name: string;
  onChange: (v: number) => void;
  step?: number | string;
}) {
  return (
    <Input
      type="number"
      name={name}
      value={Number.isNaN(value) ? "" : value}
      step={step}
      min={0}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8 w-28"
    />
  );
}

function MeterInputs({
  startValue,
  endValue,
  startName,
  name,
  onStart,
  onEnd,
  startLabel,
  endLabel,
}: {
  startValue: number;
  endValue: number;
  startName: string;
  name: string;
  onStart: (v: number) => void;
  onEnd: (v: number) => void;
  startLabel: string;
  endLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">{startLabel}</span>
        <NumInput value={startValue} name={startName} onChange={onStart} />
      </div>
      <span>–</span>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">{endLabel}</span>
        <NumInput value={endValue} name={name} onChange={onEnd} />
      </div>
    </div>
  );
}

function Amount({ value }: { value: number }) {
  return <span className="w-28 text-right font-medium">฿{formatMoney2(value)}</span>;
}
