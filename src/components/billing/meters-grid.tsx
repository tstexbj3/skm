"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import { saveMeterReadings, type MeterReading } from "@/app/(app)/billing/actions";
import { meterUnits } from "@/lib/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type MeterRow = {
  billId: string;
  room: string;
  payer: string;
  /** The bill's contract has ended — its tenant already moved out. */
  movedOut: boolean;
  waterMode: string; // PER_PERSON | PER_UNIT | FLAT
  waterStart: number;
  waterEnd: number;
  elecStart: number;
  elecEnd: number;
  elecManual: boolean;
  digits: number;
};

/** parse an input value to a number, or null when blank/invalid. */
function toNum(v: string): number | null {
  const s = v.trim();
  if (s === "") return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
}

export function MetersGrid({
  month,
  rows,
}: {
  month: string;
  rows: MeterRow[];
}) {
  const t = useTranslations("billing");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // per-row input strings, prefilled with the current readings
  const mk = (pick: (r: MeterRow) => number) =>
    Object.fromEntries(rows.map((r) => [r.billId, String(pick(r))]));
  const [elecS, setElecS] = useState<Record<string, string>>(() => mk((r) => r.elecStart));
  const [elecE, setElecE] = useState<Record<string, string>>(() => mk((r) => r.elecEnd));
  const [waterS, setWaterS] = useState<Record<string, string>>(() => mk((r) => r.waterStart));
  const [waterE, setWaterE] = useState<Record<string, string>>(() => mk((r) => r.waterEnd));

  const cell =
    "h-8 w-20 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  function save() {
    setMsg(null);
    const readings: MeterReading[] = [];
    for (const r of rows) {
      const metered = r.waterMode === "PER_UNIT";
      const eS = toNum(elecS[r.billId] ?? "");
      const eE = toNum(elecE[r.billId] ?? "");
      const wS = toNum(waterS[r.billId] ?? "");
      const wE = toNum(waterE[r.billId] ?? "");
      const elecStart = !r.elecManual && eS != null && eS !== r.elecStart ? eS : null;
      const elecEnd = !r.elecManual && eE != null && eE !== r.elecEnd ? eE : null;
      const waterStart = metered && wS != null && wS !== r.waterStart ? wS : null;
      const waterEnd = metered && wE != null && wE !== r.waterEnd ? wE : null;
      if (elecStart != null || elecEnd != null || waterStart != null || waterEnd != null)
        readings.push({ billId: r.billId, elecStart, elecEnd, waterStart, waterEnd });
    }
    if (readings.length === 0) {
      setMsg(t("meters.nothingChanged"));
      return;
    }
    startTransition(async () => {
      const res = await saveMeterReadings(month, readings);
      if (res.error) {
        setMsg(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
      } else {
        setMsg(t("meters.savedCount", { n: res.saved ?? 0 }));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("month")}</span>
        <Input
          type="month"
          defaultValue={month}
          className="w-44"
          onChange={(e) =>
            e.target.value && router.push(`/billing/meters?month=${e.target.value}`)
          }
        />
        <Button size="sm" disabled={pending || rows.length === 0} onClick={save}>
          <Save className="size-4" />
          {t("meters.saveAll")}
        </Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>

      <p className="text-sm text-muted-foreground">{t("meters.hint")}</p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t("room")}</th>
              <th className="px-3 py-2 font-medium">{t("payer")}</th>
              <th className="px-3 py-2 font-medium">
                {t("electricity")} · {t("meterStart")}
              </th>
              <th className="px-3 py-2 font-medium">
                {t("electricity")} · {t("meterEnd")}
              </th>
              <th className="px-3 py-2 text-right font-medium">{t("units")}</th>
              <th className="px-3 py-2 font-medium">
                {t("water")} · {t("meterStart")}
              </th>
              <th className="px-3 py-2 font-medium">
                {t("water")} · {t("meterEnd")}
              </th>
              <th className="px-3 py-2 text-right font-medium">{t("units")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const metered = r.waterMode === "PER_UNIT";
              const eS = toNum(elecS[r.billId] ?? "");
              const eE = toNum(elecE[r.billId] ?? "");
              const eUnits =
                eE != null ? meterUnits(eS ?? r.elecStart, eE, r.digits) : null;
              const wS = toNum(waterS[r.billId] ?? "");
              const wE = toNum(waterE[r.billId] ?? "");
              const wUnits =
                wE != null ? meterUnits(wS ?? r.waterStart, wE, r.digits) : null;
              return (
                <tr key={r.billId} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.room}</td>
                  <td className="px-3 py-2">
                    {r.payer}
                    {r.movedOut && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                        {t("movedOut")}
                      </span>
                    )}
                  </td>
                  {/* electricity start */}
                  <td className="px-3 py-2">
                    {r.elecManual ? (
                      <span className="text-muted-foreground">{r.elecStart}</span>
                    ) : (
                      <input
                        type="number"
                        inputMode="numeric"
                        value={elecS[r.billId] ?? ""}
                        onChange={(ev) =>
                          setElecS((s) => ({ ...s, [r.billId]: ev.target.value }))
                        }
                        className={cell}
                      />
                    )}
                  </td>
                  {/* electricity end */}
                  <td className="px-3 py-2">
                    {r.elecManual ? (
                      <Link
                        href={`/billing/${r.billId}`}
                        className="text-xs text-amber-600 hover:underline"
                      >
                        {t("manualElec")}
                      </Link>
                    ) : (
                      <input
                        type="number"
                        inputMode="numeric"
                        value={elecE[r.billId] ?? ""}
                        onChange={(ev) =>
                          setElecE((s) => ({ ...s, [r.billId]: ev.target.value }))
                        }
                        className={cell}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {eUnits ?? "—"}
                  </td>
                  {/* water start */}
                  <td className="px-3 py-2">
                    {metered ? (
                      <input
                        type="number"
                        inputMode="numeric"
                        value={waterS[r.billId] ?? ""}
                        onChange={(ev) =>
                          setWaterS((s) => ({ ...s, [r.billId]: ev.target.value }))
                        }
                        className={cell}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {/* water end */}
                  <td className="px-3 py-2">
                    {metered ? (
                      <input
                        type="number"
                        inputMode="numeric"
                        value={waterE[r.billId] ?? ""}
                        onChange={(ev) =>
                          setWaterE((s) => ({ ...s, [r.billId]: ev.target.value }))
                        }
                        className={cell}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t("meters.notMetered")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {metered ? wUnits ?? "—" : "—"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-muted-foreground"
                >
                  {t("meters.noDrafts")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
