"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  DoorClosed,
  Users,
  FileText,
  Wallet,
  Receipt,
  LogOut,
  BarChart3,
  Briefcase,
  CheckCircle2,
  MessageSquareText,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  DoorClosed,
  Users,
  FileText,
  Wallet,
  Receipt,
  LogOut,
  BarChart3,
  Briefcase,
  CheckCircle2,
  MessageSquareText,
  SlidersHorizontal,
};

export type NavClientItem = { key: string; href: string; icon: string };

export function AppNav({
  items,
  orientation,
  className,
}: {
  items: NavClientItem[];
  orientation: "vertical" | "horizontal";
  className?: string;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      className={cn(
        orientation === "vertical"
          ? "flex flex-col gap-1"
          : "flex gap-1 overflow-x-auto p-2",
        className
      )}
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span>{t(item.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
