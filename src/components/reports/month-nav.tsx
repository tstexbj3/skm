"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";

export function MonthNav({ month }: { month: string }) {
  const t = useTranslations("reports");
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{t("month")}</span>
      <Input
        type="month"
        defaultValue={month}
        className="w-44"
        onChange={(e) =>
          e.target.value && router.push(`/reports?month=${e.target.value}`)
        }
      />
    </div>
  );
}
