"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Send, CheckCircle2, Printer } from "lucide-react";
import {
  sendBill,
  approveBill,
  type BillActionState,
} from "@/app/(app)/billing/actions";
import { Button } from "@/components/ui/button";

type Action = (
  prev: BillActionState,
  fd: FormData
) => Promise<BillActionState>;

export function BillWorkflow({
  id,
  status,
  isOwner,
  printCount,
}: {
  id: string;
  status: string;
  isOwner: boolean;
  printCount: number;
}) {
  const t = useTranslations("billing");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: Action) {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await action({}, fd);
      if (res?.error)
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "DRAFT" && (
        <Button size="sm" disabled={pending} onClick={() => run(sendBill)}>
          <Send className="size-4" />
          {t("send")}
        </Button>
      )}

      {status === "SENT" &&
        (isOwner ? (
          <Button size="sm" disabled={pending} onClick={() => run(approveBill)}>
            <CheckCircle2 className="size-4" />
            {t("approve")}
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">
            {t("awaitingApproval")}
          </span>
        ))}

      {(status === "APPROVED" || status === "PRINTED") && (
        <>
          <Button asChild size="sm">
            <Link href={`/print/bill/${id}`}>
              <Printer className="size-4" />
              {status === "PRINTED" ? t("reprint") : t("print")}
            </Link>
          </Button>
          {status === "PRINTED" && printCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {t("printedTimes", { n: printCount })}
            </span>
          )}
        </>
      )}

      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
