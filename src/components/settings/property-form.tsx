"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updatePropertySettings } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function PropertyForm({
  name,
  address,
  phone,
}: {
  name: string;
  address: string | null;
  phone: string | null;
}) {
  const t = useTranslations("settings");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await updatePropertySettings({}, formData);
      if (res.ok) setSaved(true);
      else setError(res.error ?? "error");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("propertyTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="p_name">{t("propertyName")}</Label>
            <Input id="p_name" name="name" defaultValue={name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p_address">{t("address")}</Label>
            <Input id="p_address" name="address" defaultValue={address ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p_phone">{t("phone")}</Label>
            <Input id="p_phone" name="phone" defaultValue={phone ?? ""} />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
            {saved && <span className="text-sm text-emerald-600">{t("saved")}</span>}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
