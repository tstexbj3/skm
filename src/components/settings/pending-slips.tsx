"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  assignPendingSlip,
  rejectPendingSlip,
} from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { RoomOption } from "@/components/settings/line-accounts";

export type PendingSlipRow = {
  id: string;
  displayName: string;
  amount: string;
  sender: string;
  bank: string;
  slipUrl: string | null;
  date: string;
};

const selectClass =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function PendingSlips({
  slips,
  rooms,
}: {
  slips: PendingSlipRow[];
  rooms: RoomOption[];
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, string>>({});

  function assign(id: string) {
    const room = sel[id];
    if (!room) return;
    setError(null);
    startTransition(async () => {
      const res = await assignPendingSlip(id, room);
      if (res.error)
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
      else router.refresh();
    });
  }

  function reject(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await rejectPendingSlip(id);
      if (res.error)
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("pendingTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("pendingHint")}</p>
        {slips.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("pendingEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {slips.map((s) => (
              <li key={s.id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div>
                    <span className="font-medium">
                      {s.displayName || t("lineUnlinked")}
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      ฿{s.amount}
                      {s.sender ? ` · ${s.sender}` : ""}
                      {s.bank ? ` · ${s.bank}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">{s.date}</span>
                    {s.slipUrl && (
                      <a
                        href={s.slipUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {t("pendingViewSlip")}
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={selectClass}
                    value={sel[s.id] ?? ""}
                    onChange={(e) =>
                      setSel((m) => ({ ...m, [s.id]: e.target.value }))
                    }
                  >
                    <option value="">{t("pendingSelectRoom")}</option>
                    {rooms.map((r) => (
                      <option key={r.room} value={r.room}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={pending || !sel[s.id]}
                    onClick={() => assign(s.id)}
                  >
                    {t("pendingAssign")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={pending}
                    onClick={() => reject(s.id)}
                  >
                    {t("pendingReject")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
