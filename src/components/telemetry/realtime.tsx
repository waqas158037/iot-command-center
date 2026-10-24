"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Radio, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "connecting" | "live" | "reconnecting" | "polling";

export interface LiveEvent {
  type: "telemetry" | "alert" | "device_status";
  projectId: string;
  deviceId?: string | null;
  readings?: { sensorId: string; sensorKey: string; value: number; unit: string; occurredAt: string }[];
  receivedAt?: string;
  source?: string;
  status?: string;
  severity?: string;
  title?: string;
}

const LiveContext = createContext<{ status: Status; lastEvent: LiveEvent | null; subscribe: (fn: (e: LiveEvent) => void) => () => void } | null>(null);

/**
 * Opens one SSE connection scoped by project/device. Server components re-render via
 * router.refresh() (throttled); client widgets can subscribe to individual events.
 * Reconnects with bounded backoff (1s → 30s) and falls back to polling after repeated failures.
 */
export function LiveProvider({ projectId, deviceId, refreshMs = 15_000, children }: { projectId?: string; deviceId?: string; refreshMs?: number; children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("connecting");
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null);
  const listeners = useRef(new Set<(e: LiveEvent) => void>());
  const lastRefresh = useRef(0);
  const pendingRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let retry = 1000;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let closed = false;

    const scheduleRefresh = () => {
      const wait = Math.max(0, lastRefresh.current + refreshMs - Date.now());
      if (pendingRefresh.current) return;
      pendingRefresh.current = setTimeout(() => {
        pendingRefresh.current = null;
        lastRefresh.current = Date.now();
        router.refresh();
      }, wait);
    };

    const connect = () => {
      if (closed) return;
      const qs = new URLSearchParams();
      if (projectId) qs.set("projectId", projectId);
      if (deviceId) qs.set("deviceId", deviceId);
      es = new EventSource(`/api/monitoring/realtime?${qs}`);
      es.addEventListener("ready", () => {
        retry = 1000;
        failures = 0;
        setStatus("live");
      });
      const handler = (msg: MessageEvent) => {
        try {
          const e = JSON.parse(msg.data) as LiveEvent;
          setLastEvent(e);
          listeners.current.forEach((fn) => fn(e));
          scheduleRefresh();
        } catch {}
      };
      ["telemetry", "alert", "device_status"].forEach((t) => es!.addEventListener(t, handler as EventListener));
      es.onerror = () => {
        es?.close();
        failures++;
        if (failures >= 5) {
          // Documented fallback: periodic refresh of server-rendered data.
          setStatus("polling");
          pollTimer = setInterval(() => router.refresh(), 30_000);
          return;
        }
        setStatus("reconnecting");
        timer = setTimeout(connect, retry);
        retry = Math.min(retry * 2, 30_000);
      };
    };
    connect();
    return () => {
      closed = true;
      es?.close();
      clearTimeout(timer);
      clearInterval(pollTimer);
      if (pendingRefresh.current) clearTimeout(pendingRefresh.current);
    };
  }, [projectId, deviceId, refreshMs, router]);

  const subscribe = (fn: (e: LiveEvent) => void) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  };

  return <LiveContext.Provider value={{ status, lastEvent, subscribe }}>{children}</LiveContext.Provider>;
}

export function useLive() {
  return useContext(LiveContext);
}

export function LiveIndicator({ className }: { className?: string }) {
  const ctx = useLive();
  const router = useRouter();
  const status = ctx?.status ?? "polling";
  const label = { connecting: "Connecting…", live: "Live", reconnecting: "Reconnecting…", polling: "Polling every 30 s" }[status];
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium", className)} role="status" aria-live="polite">
      {status === "live" ? (
        <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-success" /></span>
      ) : status === "polling" ? <WifiOff className="size-3.5 text-warning" /> : <Radio className="size-3.5 text-muted-foreground" />}
      {label}
      <button type="button" onClick={() => router.refresh()} className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Refresh now"><RefreshCw className="size-3.5" /></button>
    </span>
  );
}
