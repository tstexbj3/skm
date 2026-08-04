"use client";

import { useTranslations } from "next-intl";
import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ModulePlaceholder({
  navKey,
  ownerOnly = false,
}: {
  navKey: string;
  ownerOnly?: boolean;
}) {
  const tNav = useTranslations("nav");
  const t = useTranslations("common");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{tNav(navKey)}</h1>
        {ownerOnly && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            {t("ownerOnly")}
          </span>
        )}
      </div>
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Construction className="size-8" />
          <p className="font-medium text-foreground">{t("comingSoon")}</p>
          <p className="text-sm">{t("comingSoonBody")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
