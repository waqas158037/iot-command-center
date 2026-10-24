"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, BarChart3, Bell, Cpu, FolderKanban, Gauge, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Radio, ScrollText, Settings, Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-items";

const ICONS = {
  dashboard: LayoutDashboard,
  projects: FolderKanban,
  devices: Cpu,
  monitoring: Activity,
  sensors: Gauge,
  alerts: Bell,
  reports: BarChart3,
  team: Users,
  audit: ScrollText,
  settings: Settings,
} as const;

export function SidebarNav({ items, collapsed = false, onNavigate }: { items: NavItem[]; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(item.href + "/") || (item.href === "/alerts" && pathname.startsWith("/alert-rules"));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-primary",
              active && "bg-sidebar-accent text-sidebar-accent-foreground",
              collapsed && "justify-center px-2",
            )}
          >
            <Icon className={cn("size-4 shrink-0 text-sidebar-muted group-hover:text-sidebar-primary", active && "text-sidebar-primary")} aria-hidden />
            <span className={cn(collapsed && "sr-only")}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-2.5 px-4 py-4", collapsed && "justify-center px-2")}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary/15 text-sidebar-primary">
        <Radio className="size-4" aria-hidden />
      </span>
      <span className={cn("text-sm font-semibold text-white", collapsed && "sr-only")}>IoT Command Center</span>
    </Link>
  );
}

export function Sidebar({ items }: { items: NavItem[] }) {
  // Desktop default is expanded; tablets default to compact. Preference is remembered per browser.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("sidebar-collapsed");
    } catch {}
    const initial = stored !== null ? stored === "1" : window.innerWidth < 1280;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a browser-only preference after hydration
    setCollapsed(initial);
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidebar-collapsed", c ? "0" : "1");
      } catch {}
      return !c;
    });
  };
  return (
    <aside className={cn("no-print sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex", collapsed ? "w-16" : "w-60")}>
      <Brand collapsed={collapsed} />
      <div className="flex-1 overflow-y-auto py-2">
        <SidebarNav items={items} collapsed={collapsed} />
      </div>
      <button
        type="button"
        onClick={toggle}
        className="m-2 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Collapse</>}
      </button>
    </aside>
  );
}
