"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Droplets, Zap, Pencil } from "lucide-react";
import { updateUtilityRates } from "@/app/(app)/rooms/actions";
import { formatMoney } from "@/lib/rooms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function UtilityRatesSetting({
  waterPersonRate,
  electricityUnitRate,
  electricityMinCharge,
  meterDigits,
  isOwner,
}: {
  waterPersonRate: number;
  electricityUnitRate: number;
  electricityMinCharge: number;
  meterDigits: number;
  isOwner: boolean;
}) {
  const t = useTranslations("rooms");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await updateUtilityRates({}, formData);
      if (res.ok) {
        setError(null);
        setEditing(false);
      } else {
        setError(res.error === "auth" ? t("errors.auth") : res.error ?? "error");
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {t("utilityRates")}
        </h2>
        {isOwner && !editing && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
          >
            <Pencil className="size-4" />
            {t("editRate")}
          </Button>
        )}
      </div>

      {editing ? (
        <form action={onSubmit} className="mt-3 flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="water_person_rate" className="text-xs">
              <Droplets className="size-3.5 text-blue-500" />
              {t("waterRateLabel")}
            </Label>
            <div className="flex items-center gap-1">
              <Input
                id="water_person_rate"
                name="water_person_rate"
                type="number"
                min={0}
                step="any"
                defaultValue={waterPersonRate}
                className="h-8 w-28"
              />
              <span className="text-xs text-muted-foreground">
                {t("perPersonUnit")}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="electricity_unit_rate" className="text-xs">
              <Zap className="size-3.5 text-amber-500" />
              {t("electricityRateLabel")}
            </Label>
            <div className="flex items-center gap-1">
              <Input
                id="electricity_unit_rate"
                name="electricity_unit_rate"
                type="number"
                min={0}
                step="any"
                defaultValue={electricityUnitRate}
                className="h-8 w-28"
              />
              <span className="text-xs text-muted-foreground">
                {t("perUnitUnit")}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="electricity_min_charge" className="text-xs">
              <Zap className="size-3.5 text-amber-500" />
              {t("elecMinCharge")}
            </Label>
            <div className="flex items-center gap-1">
              <Input
                id="electricity_min_charge"
                name="electricity_min_charge"
                type="number"
                min={0}
                step="any"
                defaultValue={electricityMinCharge}
                className="h-8 w-28"
              />
              <span className="text-xs text-muted-foreground">
                {t("baht")}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="meter_digits" className="text-xs">
              {t("meterDigits")}
            </Label>
            <Input
              id="meter_digits"
              name="meter_digits"
              type="number"
              min={0}
              max={8}
              step={1}
              defaultValue={meterDigits}
              className="h-8 w-24"
            />
          </div>

          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={pending}>
              {t("save")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                setError(null);
                setEditing(false);
              }}
            >
              {t("cancel")}
            </Button>
          </div>
          {error && (
            <p className="w-full text-sm text-destructive">{error}</p>
          )}
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Droplets className="size-5 shrink-0 text-blue-500" />
            <div>
              <div className="text-xs text-muted-foreground">
                {t("waterRateLabel")}
              </div>
              <div className="font-semibold">
                ฿{formatMoney(waterPersonRate)}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {t("perPersonUnit")}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="size-5 shrink-0 text-amber-500" />
            <div>
              <div className="text-xs text-muted-foreground">
                {t("electricityRateLabel")}
              </div>
              <div className="font-semibold">
                ฿{formatMoney(electricityUnitRate)}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {t("perUnitUnit")}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="size-5 shrink-0 text-amber-500" />
            <div>
              <div className="text-xs text-muted-foreground">
                {t("elecMinCharge")}
              </div>
              <div className="font-semibold">
                ฿{formatMoney(electricityMinCharge)}
              </div>
            </div>
          </div>
          {meterDigits > 0 && (
            <div>
              <div className="text-xs text-muted-foreground">
                {t("meterDigits")}
              </div>
              <div className="font-semibold">{meterDigits}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
