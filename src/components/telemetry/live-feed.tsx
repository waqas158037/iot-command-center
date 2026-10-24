"use client";

import * as React from "react";
import { Activity } from "lucide-react";
import { useLive, type LiveEvent } from "./realtime";
import { Badge } from "@/components/ui/badge";

interface Row { id: number; at: string; text: string; kind: LiveEvent["type"]; simulated: boolean; severity?: string }

/** Rolling list of realtime events received over SSE for the current scope (most recent 50). */
export function LiveFeed({ deviceNames, sensorLabels }: { deviceNames: Record<string, string>; sensorLabels: Record<string, string> }) {
  const live = useLive();
  const [rows, setRows] = React.useState<Row[]>([]);
  const seq = React.useRef(0);
  React.useEffect(() => {
    if (!live) return;
    return live.subscribe((e) => {
      const device = e.deviceId ? deviceNames[e.deviceId] ?? "Device" : "Project";
      let text = "";
      if (e.type === "telemetry") text = `${device}: ${(e.readings ?? []).slice(0, 4).map((r) => `${sensorLabels[r.sensorId] ?? r.sensorKey} ${Number(r.value).toFixed(2)} ${r.unit}`).join(", ")}${(e.readings?.length ?? 0) > 4 ? "…" : ""}`;
      else if (e.type === "alert") text = `Alert ${e.status?.toLowerCase() ?? ""}: ${e.title ?? ""}`;
      else text = `${device} is now ${e.status?.toLowerCase()}`;
      setRows((prev) => [{ id: ++seq.current, at: new Date().toISOString(), text, kind: e.type, simulated: e.source === "SIMULATED", severity: e.severity }, ...prev].slice(0, 50));
    });
  }, [live, deviceNames, sensorLabels]);

  if (rows.length === 0) {
    return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Activity className="size-4" /> Waiting for events. Start the simulator or send telemetry from a device; events appear here as they are stored.</p>;
  }
  return (
    <ul className="divide-y text-sm" aria-live="polite" aria-relevant="additions">
      {rows.map((r) => (
        <li key={r.id} className="flex items-start gap-3 py-2">
          <time className="w-20 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{new Date(r.at).toLocaleTimeString()}</time>
          <Badge variant={r.kind === "alert" ? (r.severity === "CRITICAL" || r.severity === "HIGH" ? "danger" : "warning") : r.kind === "device_status" ? "info" : "muted"} className="shrink-0">{r.kind === "device_status" ? "status" : r.kind}</Badge>
          <span className="min-w-0 flex-1 break-words">{r.text}</span>
          {r.simulated && <Badge variant="simulated" className="shrink-0">Simulated</Badge>}
        </li>
      ))}
    </ul>
  );
}
