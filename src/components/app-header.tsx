"use client";

import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/auth";

export function AppHeader({ role, name }: { role: Role; name: string }) {
  const t = useTranslations();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-background px-4 py-3">
      <div className="font-semibold">{t("app.name")}</div>
      <div className="flex items-center gap-2">
        <span className="hidden text-sm text-muted-foreground sm:inline">
          {name} · {t(`roles.${role}`)}
        </span>
        <LanguageToggle />
        <form action={signOut}>
          <Button variant="outline" size="sm" type="submit">
            <LogOut className="size-4" />
            <span className="hidden sm:inline">{t("common.signOut")}</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
