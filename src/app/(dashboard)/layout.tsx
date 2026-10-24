import { requirePageUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/permissions/policies";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { navItemsForRole } from "@/components/layout/nav-items";
import { signOutAction } from "./actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const items = navItemsForRole(user.role);
  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar items={items} user={{ name: user.name, email: user.email, roleLabel: ROLE_LABELS[user.role] }} signOutAction={signOutAction} />
        <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
