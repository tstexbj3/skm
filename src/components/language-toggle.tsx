"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { setLocale } from "@/i18n/actions";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/request";

export function LanguageToggle() {
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  const next: Locale = locale === "th" ? "en" : "th";

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => setLocale(next))}
      aria-label="Switch language"
    >
      <Languages className="size-4" />
      {locale === "th" ? "EN" : "ไทย"}
    </Button>
  );
}
