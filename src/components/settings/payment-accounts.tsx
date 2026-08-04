"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  addPaymentAccount,
  updatePaymentAccount,
  deletePaymentAccount,
  togglePaymentAccount,
} from "@/app/(app)/settings/actions";
import { QR_BUCKET } from "@/lib/buckets";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

export type AccountRow = {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  active: boolean;
  qrUrl: string | null;
};

export function PaymentAccounts({ accounts }: { accounts: AccountRow[] }) {
  const t = useTranslations("settings");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [deleting, setDeleting] = useState<AccountRow | null>(null);
  const [busy, setBusy] = useState(0);
  const onBusy = (b: boolean) => setBusy((nb) => nb + (b ? 1 : -1));

  function add(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await addPaymentAccount({}, formData);
      if (res.error)
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
    });
  }

  function toggle(id: string, active: boolean) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("active", String(active));
      await togglePaymentAccount({}, fd);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("accountsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("accountsEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex items-center gap-3">
                  {a.qrUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.qrUrl}
                      alt="QR"
                      className="size-12 rounded border object-cover"
                    />
                  ) : (
                    <div className="flex size-12 items-center justify-center rounded border bg-muted text-[10px] text-muted-foreground">
                      no QR
                    </div>
                  )}
                  <div className="text-sm">
                    <div className="font-medium">
                      {a.bank_name}
                      {!a.active && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({t("deactivate")})
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      {a.account_name} · {a.account_number}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                    <Pencil className="size-4" />
                    {t("edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => toggle(a.id, !a.active)}
                  >
                    {a.active ? t("deactivate") : t("activate")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleting(a)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form action={add} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="bank_name" className="text-xs">
              {t("bankName")}
            </Label>
            <Input id="bank_name" name="bank_name" className="h-8" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="account_name" className="text-xs">
              {t("accountName")}
            </Label>
            <Input id="account_name" name="account_name" className="h-8" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="account_number" className="text-xs">
              {t("accountNumber")}
            </Label>
            <Input
              id="account_number"
              name="account_number"
              className="h-8"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("qr")}</Label>
            <FileUpload name="qr" bucket={QR_BUCKET} onBusyChange={onBusy} />
          </div>
          <div className="sm:col-span-2">
            <Button
              size="sm"
              variant="outline"
              type="submit"
              disabled={pending || busy > 0}
            >
              <Plus className="size-4" />
              {t("addAccount")}
            </Button>
            {error && (
              <span className="ml-3 text-sm text-destructive">{error}</span>
            )}
          </div>
        </form>
      </CardContent>

      {editing && (
        <EditDialog account={editing} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <DeleteDialog account={deleting} onClose={() => setDeleting(null)} />
      )}
    </Card>
  );
}

function EditDialog({
  account,
  onClose,
}: {
  account: AccountRow;
  onClose: () => void;
}) {
  const t = useTranslations("settings");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);
  const onBusy = (b: boolean) => setBusy((nb) => nb + (b ? 1 : -1));

  function save(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updatePaymentAccount({}, formData);
      if (res.ok) onClose();
      else setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error ?? "error");
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editAccount")}</DialogTitle>
        </DialogHeader>
        <form action={save} className="space-y-3">
          <input type="hidden" name="id" value={account.id} />
          <div className="space-y-1">
            <Label htmlFor="e_bank">{t("bankName")}</Label>
            <Input id="e_bank" name="bank_name" defaultValue={account.bank_name} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="e_name">{t("accountName")}</Label>
            <Input id="e_name" name="account_name" defaultValue={account.account_name} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="e_num">{t("accountNumber")}</Label>
            <Input id="e_num" name="account_number" defaultValue={account.account_number} required />
          </div>
          <div className="space-y-1">
            <Label>{t("qr")}</Label>
            <FileUpload name="qr" bucket={QR_BUCKET} onBusyChange={onBusy} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel") ?? "Cancel"}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || busy > 0}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  account,
  onClose,
}: {
  account: AccountRow;
  onClose: () => void;
}) {
  const t = useTranslations("settings");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function del() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", account.id);
      const res = await deletePaymentAccount({}, fd);
      if (res.ok) onClose();
      else setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error ?? "error");
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteAccount")}</DialogTitle>
          <DialogDescription>
            {account.bank_name} · {account.account_number}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("cancel") ?? "Cancel"}
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" disabled={pending} onClick={del}>
            {t("deleteConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
