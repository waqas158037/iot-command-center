"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  kind: string;
  alertId: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationCenter() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?pageSize=10", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items);
      setUnread(data.unreadCount);
    } catch {
      // Network blips are retried on the next poll.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch, then poll
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read: true }) });
    void load();
  }
  async function markAll() {
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
    void load();
  }

  return (
    <DropdownMenu onOpenChange={(o) => o && void load()}>
      <DropdownMenuTrigger asChild>
        <button className="relative rounded-md p-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Notifications, ${unread} unread`}>
          <Bell className="size-5 text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          <button onClick={markAll} disabled={unread === 0} className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-40">
            <CheckCheck className="size-3.5" /> Mark all read
          </button>
        </div>
        <ul className="max-h-96 overflow-y-auto" aria-live="polite">
          {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</li>}
          {items.map((n) => (
            <li key={n.id} className={cn("border-b last:border-0", !n.readAt && "bg-primary/4")}>
              <Link
                href={n.alertId ? `/alerts/${n.alertId}` : "/alerts"}
                onClick={() => !n.readAt && void markRead(n.id)}
                className="block px-3 py-2.5 hover:bg-muted/50"
              >
                <span className="flex items-start gap-2">
                  {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{n.title}</span>
                    <span className="line-clamp-2 block text-xs text-muted-foreground">{n.message}</span>
                    <span className="block text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="border-t px-3 py-2 text-center">
          <Link href="/settings/notifications" className="text-xs text-primary hover:underline">Notification preferences</Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
