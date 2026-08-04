"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { recordExpense } from "@/app/(app)/expenses/actions";
import { FORM_CATEGORIES } from "@/lib/expenses";
import { EXPENSE_MEDIA_BUCKET } from "@/lib/buckets";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function RecordExpense({
  rooms,
}: {
  rooms: { id: string; room_number: string }[];
}) {
  const t = useTranslations("expenses");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(0);
  const onBusy = (b: boolean) => setBusy((nb) => nb + (b ? 1 : -1));
  const today = new Date().toISOString().slice(0, 10);

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await recordExpense({}, formData);
      if (res.ok) setSaved(true);
      else setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error ?? "error");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("record")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="category">{t("category")}</Label>
            <select id="category" name="category" className={selectClass} defaultValue="OTHER">
              {FORM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`categories.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">{t("amount")}</Label>
            <Input id="amount" name="amount" type="number" min={0} step="any" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="room_id">{t("room")}</Label>
            <select id="room_id" name="room_id" className={selectClass} defaultValue="">
              <option value="">{t("commonArea")}</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.room_number}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expense_date">{t("date")}</Label>
            <Input id="expense_date" name="expense_date" type="date" defaultValue={today} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">{t("description")}</Label>
            <Input id="description" name="description" />
          </div>
          <div className="space-y-2">
            <Label>{t("billPhoto")}</Label>
            <FileUpload name="bill_image" bucket={EXPENSE_MEDIA_BUCKET} onBusyChange={onBusy} />
          </div>
          <div className="space-y-2">
            <Label>{t("itemPhoto")}</Label>
            <FileUpload name="item_image" bucket={EXPENSE_MEDIA_BUCKET} onBusyChange={onBusy} />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending || busy > 0}>
              <Plus className="size-4" />
              {t("record")}
            </Button>
            {saved && <span className="text-sm text-emerald-600">{t("saved")}</span>}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
