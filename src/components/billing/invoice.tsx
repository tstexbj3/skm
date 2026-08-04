import { useTranslations } from "next-intl";
import { n, formatMoney2, meterUnits } from "@/lib/billing";

type BillRow = { label: string; sub?: string; amount: number };
type LineItem = { label: string; amount: string };

export type InvoiceProperty = { name: string; address: string | null };
export type InvoiceAccount = {
  bank_name: string;
  account_name: string;
  account_number: string;
  qrUrl: string | null;
} | null;

export function Invoice({
  bill,
  items,
  property,
  account,
}: {
  bill: Record<string, unknown>;
  items: LineItem[];
  property: InvoiceProperty;
  account: InvoiceAccount;
}) {
  const t = useTranslations("billing");
  const tApp = useTranslations("app");

  const digits = n(bill.meter_digits);
  const waterMode = bill.water_billing_mode as string;
  const waterUnits = meterUnits(n(bill.water_start), n(bill.water_end), digits);
  const elecUnits = meterUnits(n(bill.elec_start), n(bill.elec_end), digits);

  const waterSub =
    waterMode === "PER_PERSON"
      ? `(${bill.water_persons} ${t("personsShort")})`
      : waterMode === "FLAT"
        ? `(${t("flatWater")})`
        : `${t("meter")} ${n(bill.water_start)} - ${n(bill.water_end)} = ${waterUnits} ${t("units")}`;

  const rows: BillRow[] = [
    { label: t("rent"), amount: n(bill.rent_amount) },
    { label: t("water"), sub: waterSub, amount: n(bill.water_amount) },
    {
      label: t("electricity"),
      sub: bill.elec_is_manual
        ? t("manualElec")
        : `${t("meter")} ${n(bill.elec_start)} - ${n(bill.elec_end)} = ${elecUnits} ${t("units")}`,
      amount: n(bill.elec_amount),
    },
  ];
  if (n(bill.late_fee_amount) > 0)
    rows.push({
      label: t("lateFee"),
      sub: (bill.late_fee_since_date as string) ?? undefined,
      amount: n(bill.late_fee_amount),
    });
  if (n(bill.other_charge_amount) > 0)
    rows.push({
      label: (bill.other_charge_label as string) || t("other"),
      amount: n(bill.other_charge_amount),
    });
  for (const it of items) rows.push({ label: it.label, amount: n(it.amount) });

  return (
    <div className="border-2 border-black p-6 text-black">
      <div className="mb-1 flex items-start justify-between">
        <div>
          <div className="text-xl font-bold">
            {property.name || tApp("name")}
          </div>
          {property.address && (
            <div className="max-w-xs text-xs text-gray-700">
              {property.address}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{t("invoiceTitle")}</div>
          <div className="text-sm">
            {t("billDate")}: {String(bill.bill_date)}
          </div>
        </div>
      </div>

      <div className="mb-4 mt-2 flex justify-between border-b border-black pb-2 text-sm">
        <div>
          {t("dear")}:{" "}
          <span className="font-medium">{String(bill.payer_name)}</span>
        </div>
        <div>
          {t("room")}:{" "}
          <span className="font-medium">{String(bill.room_number)}</span>
        </div>
      </div>

      <table className="w-full text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-dashed border-gray-400">
              <td className="py-2">
                {r.label}
                {r.sub && (
                  <span className="ml-2 text-xs text-gray-600">{r.sub}</span>
                )}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatMoney2(r.amount)} {t("baht")}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-black">
            <td className="py-2 text-base font-bold">{t("grandTotal")}</td>
            <td className="py-2 text-right text-base font-bold tabular-nums">
              {formatMoney2(n(bill.total_amount))} {t("baht")}
            </td>
          </tr>
        </tbody>
      </table>

      {account && (
        <div className="mt-4 flex items-start justify-between border-t border-black pt-3">
          <div className="text-sm">
            <div className="font-medium">{t("payTo")}</div>
            <div>{account.bank_name}</div>
            <div>{account.account_name}</div>
            <div className="tabular-nums">{account.account_number}</div>
          </div>
          {account.qrUrl && (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={account.qrUrl}
                alt="QR"
                className="size-28 object-contain"
              />
              <div className="text-xs">{t("scanToPay")}</div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex items-end justify-between text-sm">
        <div>
          {t("note")}: {(bill.note as string) ?? ""}
        </div>
        <div className="text-right">
          {t("receivedBy")}: {(bill.received_by as string) ?? "____________"}
        </div>
      </div>
    </div>
  );
}
