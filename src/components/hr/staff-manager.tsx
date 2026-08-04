"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Banknote } from "lucide-react";
import {
  addStaff,
  updateStaff,
  toggleStaff,
  paySalary,
} from "@/app/(app)/hr/actions";
import { formatMoney2 } from "@/lib/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

export type Staff = {
  id: string;
  full_name: string;
  position: string | null;
  monthly_salary: string;
  active: boolean;
};

export function StaffManager({ staff }: { staff: Staff[] }) {
  const t = useTranslations("hr");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [paying, setPaying] = useState<Staff | null>(null);

  function add(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await addStaff({}, formData);
      if (res.error)
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
    });
  }
  function toggle(id: string, active: boolean) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("active", String(active));
      await toggleStaff({}, fd);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("roster")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {staff.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="text-sm">
                  <div className="font-medium">
                    {s.full_name}
                    {!s.active && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({t("inactive")})
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    {s.position ?? "—"} · ฿{formatMoney2(Number(s.monthly_salary))}/
                    {t("month")}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPaying(s)}>
                    <Banknote className="size-4" />
                    {t("paySalary")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                    <Pencil className="size-4" />
                    {t("edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => toggle(s.id, !s.active)}
                  >
                    {s.active ? t("deactivate") : t("activate")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form action={add} className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="full_name" className="text-xs">
              {t("name")}
            </Label>
            <Input id="full_name" name="full_name" className="h-8" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="position" className="text-xs">
              {t("position")}
            </Label>
            <Input id="position" name="position" className="h-8" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="monthly_salary" className="text-xs">
              {t("salary")}
            </Label>
            <Input
              id="monthly_salary"
              name="monthly_salary"
              type="number"
              min={0}
              step="any"
              className="h-8"
            />
          </div>
          <div className="sm:col-span-3">
            <Button size="sm" variant="outline" type="submit" disabled={pending}>
              <Plus className="size-4" />
              {t("addStaff")}
            </Button>
            {error && <span className="ml-3 text-sm text-destructive">{error}</span>}
          </div>
        </form>
      </CardContent>

      {editing && <EditDialog staff={editing} onClose={() => setEditing(null)} />}
      {paying && <PayDialog staff={paying} onClose={() => setPaying(null)} />}
    </Card>
  );
}

function EditDialog({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const t = useTranslations("hr");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function save(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updateStaff({}, formData);
      if (res.ok) onClose();
      else setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error ?? "error");
    });
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("edit")}</DialogTitle>
        </DialogHeader>
        <form action={save} className="space-y-3">
          <input type="hidden" name="id" value={staff.id} />
          <div className="space-y-1">
            <Label htmlFor="e_name">{t("name")}</Label>
            <Input id="e_name" name="full_name" defaultValue={staff.full_name} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="e_pos">{t("position")}</Label>
            <Input id="e_pos" name="position" defaultValue={staff.position ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="e_sal">{t("salary")}</Label>
            <Input id="e_sal" name="monthly_salary" type="number" min={0} step="any" defaultValue={staff.monthly_salary} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>{t("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const t = useTranslations("hr");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function pay(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await paySalary({}, formData);
      if (res.ok) onClose();
      else setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error ?? "error");
    });
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("paySalary")} · {staff.full_name}</DialogTitle>
        </DialogHeader>
        <form action={pay} className="space-y-3">
          <input type="hidden" name="staff_member_id" value={staff.id} />
          <input type="hidden" name="name" value={staff.full_name} />
          <div className="space-y-1">
            <Label htmlFor="p_amount">{t("amount")}</Label>
            <Input id="p_amount" name="amount" type="number" min={0} step="any" defaultValue={staff.monthly_salary} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="deduct_from_income" value="true" />
            {t("deductFromIncome")}
          </label>
          <p className="text-xs text-muted-foreground">{t("payHint")}</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>{t("confirmPay")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
