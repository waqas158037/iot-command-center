"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, LogOut, Menu, Search, Settings, UserRound } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Brand, SidebarNav } from "./sidebar";
import { NotificationCenter } from "./notification-center";
import { segmentLabel, type NavItem } from "./nav-items";

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground sm:flex">
      {segments.map((seg, i) => {
        const href = "/" + segments.slice(0, i + 1).join("/");
        const last = i === segments.length - 1;
        return (
          <span key={href} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
            {last ? (
              <span aria-current="page" className="truncate font-medium text-foreground">{segmentLabel(seg)}</span>
            ) : (
              <Link href={href} className="truncate hover:text-foreground">{segmentLabel(seg)}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function Topbar({ items, user, signOutAction }: { items: NavItem[]; user: { name: string; email: string; roleLabel: string }; signOutAction: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const initials = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent className="flex flex-col bg-sidebar">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Brand />
          <SidebarNav items={items} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <Breadcrumbs />

      <form
        role="search"
        className="ml-auto hidden max-w-xs flex-1 lg:flex"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q")?.toString().trim();
          if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
        }}
      >
        <label className="relative w-full">
          <span className="sr-only">Search projects and devices</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input name="q" placeholder="Search projects, devices…" className="h-9 w-full rounded-md border bg-background pr-3 pl-8 text-sm placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none" />
        </label>
      </form>

      <div className="ml-auto flex items-center gap-1 lg:ml-2">
        <NotificationCenter />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md p-1 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" aria-label="Open user menu">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">{initials}</span>
              <span className="hidden text-left leading-tight lg:block">
                <span className="block text-sm font-medium">{user.name}</span>
                <span className="block text-xs text-muted-foreground">{user.roleLabel}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <span className="block text-sm font-medium text-foreground">{user.name}</span>
              <span className="block truncate">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/settings/profile"><UserRound /> Profile</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/settings"><Settings /> Settings</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOutAction()}><LogOut /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
