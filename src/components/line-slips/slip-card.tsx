"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { assignSlip, rejectSlip } from "@/app/(app)/line-slips/actions";
import { formatMoney2, n } from "@/lib/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export type PendingSlipRow = {
  id: string;
  display_name: string | null;
  sender_name: string | null;
  amount: string;
  created_at: string;
};

export function SlipCard({
  slip,
  imageUrl,
  defaultRoom,
}: {
  slip: PendingSlipRow;
  imageUrl: string | null;
  defaultRoom: string;
}) {
  const t = useTranslations("lineSlips");
  const [room, setRoom] = useState(defaultRoom);
  const [error, setError] = useState<string | null>(null);
  const [armReject, setArmReject] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: typeof assignSlip) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", slip.id);
      fd.set("room", room.trim());
      const res = await action({}, fd);
      if (res.ok) {
        setError(null);
      } else {
        const key = res.error ?? "error";
        setError(t.has(`errors.${key}`) ? t(`errors.${key}`) : key);
      }
      setArmReject(false);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium">
              ฿{formatMoney2(n(slip.amount))}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {slip.created_at.slice(0, 10)}
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              {slip.display_name ?? "—"}
              {slip.sender_name ? ` · ${slip.sender_name}` : ""}
            </div>
          </div>
          {imageUrl ? (
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {t("view")}
            </a>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder={t("roomPlaceholder")}
            className="w-28"
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(assignSlip)}
          >
            {t("assign")}
          </Button>
          {armReject ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => run(rejectSlip)}
            >
              {t("confirmReject")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={pending}
              onClick={() => setArmReject(true)}
            >
              {t("reject")}
            </Button>
          )}
          {defaultRoom && (
            <span className="text-xs text-muted-foreground">
              {t("linkedHint", { room: defaultRoom })}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
