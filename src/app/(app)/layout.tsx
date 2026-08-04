import { getSessionContext, visibleNav } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { AppNav, type NavClientItem } from "@/components/app-nav";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await getSessionContext();
  const items: NavClientItem[] = visibleNav(ctx).map((i) => ({
    key: i.key,
    href: i.href,
    icon: i.icon,
  }));

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader role={ctx.profile.role} name={ctx.profile.full_name} />
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r p-3 md:block">
          <AppNav items={items} orientation="vertical" />
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
      <AppNav
        items={items}
        orientation="horizontal"
        className="sticky bottom-0 z-20 border-t bg-background md:hidden"
      />
    </div>
  );
}
