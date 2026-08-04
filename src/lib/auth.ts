import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { NAV_ITEMS, type Module, type NavItem } from "@/lib/nav";

export type Role = "OWNER" | "ADMIN";

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
};

export type SessionContext = {
  profile: Profile;
  /** module -> enabled. Owner: everything true. Admin: from admin_permissions (default true). */
  permissions: Record<Module, boolean>;
  isOwner: boolean;
};

/**
 * Loads the signed-in user's profile + effective module permissions.
 * Redirects to /login if there is no session. Cached per request.
 */
export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) redirect("/login");

  const isOwner = profile.role === "OWNER";

  // Default every module to enabled; apply owner's explicit toggles for admins.
  const permissions = {} as Record<Module, boolean>;
  const { data: rows } = await supabase
    .from("admin_permissions")
    .select("module, enabled");
  const map = new Map((rows ?? []).map((r) => [r.module as Module, r.enabled]));

  for (const item of NAV_ITEMS) {
    if (item.module) {
      permissions[item.module] = isOwner ? true : map.get(item.module) ?? true;
    }
  }

  return { profile, permissions, isOwner };
});

/** Nav items visible to the current user, filtered by role + permissions. */
export function visibleNav(ctx: SessionContext): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.ownerOnly) return ctx.isOwner;
    if (item.module) return ctx.permissions[item.module];
    return true;
  });
}

/** Guard a module page: redirects home if the admin lacks access. */
export async function requireModule(module: Module): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx.isOwner && !ctx.permissions[module]) redirect("/");
  return ctx;
}

/** Guard an owner-only page (HR, approvals, settings). */
export async function requireOwner(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx.isOwner) redirect("/");
  return ctx;
}
