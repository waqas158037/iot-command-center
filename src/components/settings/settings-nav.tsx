import Link from "next/link";
import { cn } from "@/lib/utils";

export function SettingsNav({ active, isAdmin }: { active: string; isAdmin: boolean }) {
  const items = [
    ...(isAdmin ? [{ href: "/settings", label: "Platform" }] : []),
    { href: "/settings/profile", label: "Profile & security" },
    { href: "/settings/notifications", label: "Notifications" },
    { href: "/settings/integrations", label: "Integrations" },
  ];
  return (
    <nav aria-label="Settings" className="-mx-4 mb-5 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {items.map((i) => (
          <li key={i.href}><Link href={i.href} aria-current={active === i.href ? "page" : undefined} className={cn("inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium text-muted-foreground hover:text-foreground", active === i.href ? "border-primary text-foreground" : "border-transparent")}>{i.label}</Link></li>
        ))}
      </ul>
    </nav>
  );
}
