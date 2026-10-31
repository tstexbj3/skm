/**
 * Central navigation / module registry. `module` maps to an admin_permissions
 * key (owner-togglable). `ownerOnly` items are never shown to admins and are not
 * togglable (e.g. HR/salary, approvals, permission settings).
 */
export const MODULES = [
  "tenants",
  "rooms",
  "billing",
  "payments",
  "expenses",
  "reports",
  "moveouts",
] as const;

export type Module = (typeof MODULES)[number];

export type NavItem = {
  key: string; // i18n key under "nav"
  href: string;
  icon: string; // lucide icon name
  module?: Module;
  ownerOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/", icon: "LayoutDashboard" },
  { key: "rooms", href: "/rooms", icon: "DoorClosed", module: "rooms" },
  { key: "tenants", href: "/tenants", icon: "Users", module: "tenants" },
  { key: "billing", href: "/billing", icon: "FileText", module: "billing" },
  { key: "payments", href: "/payments", icon: "Wallet", module: "payments" },
  { key: "lineSlips", href: "/line-slips", icon: "MessageSquareText", module: "payments" },
  { key: "expenses", href: "/expenses", icon: "Receipt", module: "expenses" },
  { key: "moveouts", href: "/moveouts", icon: "LogOut", module: "moveouts" },
  { key: "reports", href: "/reports", icon: "BarChart3", module: "reports" },
  { key: "hr", href: "/hr", icon: "Briefcase", ownerOnly: true },
  { key: "approvals", href: "/approvals", icon: "CheckCircle2", ownerOnly: true },
  { key: "settings", href: "/settings", icon: "SlidersHorizontal" },
];
