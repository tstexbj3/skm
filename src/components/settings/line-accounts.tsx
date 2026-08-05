"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { assignLineRoom } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type LineAccountRow = {
  userId: string;
  displayName: string;
  room: string | null;
};

export type RoomOption = { room: string; label: string };

const selectClass =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function LineAccounts({
  accounts,
  rooms,
}: {
  accounts: LineAccountRow[];
  rooms: RoomOption[];
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // pending selection per row (defaults to current room)
  const [sel, setSel] = useState<Record<string, string>>(() =>
    Object.fromEntries(accounts.map((a) => [a.userId, a.room ?? ""]))
  );

  function save(userId: string) {
    setError(null);
    startTransition(async () => {
      const res = await assignLineRoom(userId, sel[userId] || null);
      if (res.error)
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("lineTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("lineHint")}</p>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("lineEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li
                key={a.userId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="text-sm">
                  <div className="font-medium">
                    {a.displayName || a.userId.slice(0, 8) + "…"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.room ? `${t("lineLinkedTo")} ${a.room}` : t("lineUnlinked")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className={selectClass}
                    value={sel[a.userId] ?? ""}
                    onChange={(e) =>
                      setSel((s) => ({ ...s, [a.userId]: e.target.value }))
                    }
                  >
                    <option value="">{t("lineNoRoom")}</option>
                    {rooms.map((r) => (
                      <option key={r.room} value={r.room}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending || (sel[a.userId] ?? "") === (a.room ?? "")}
                    onClick={() => save(a.userId)}
                  >
                    {t("save")}
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
