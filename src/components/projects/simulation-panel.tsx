"use client";

import * as React from "react";
import { History, Pause, Play, Square } from "lucide-react";
import type { SimulationStatus } from "@prisma/client";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/ui/alert-banner";
import { useApiAction } from "@/components/forms/use-api-action";

const SCENARIOS = [
  { value: "NORMAL", label: "Normal operation", help: "Values follow each sensor's normal profile." },
  { value: "ABNORMAL", label: "Abnormal readings", help: "Values move into alert ranges to exercise rules." },
  { value: "MIXED", label: "Mixed", help: "Mostly normal with periodic abnormal bursts." },
  { value: "DISCONNECT", label: "Device disconnect", help: "One device stops reporting so it goes offline." },
  { value: "SENSOR_DROPOUT", label: "Sensor dropout", help: "One sensor stops reporting (missing-readings rules)." },
];

export interface SessionView {
  id: string;
  status: SimulationStatus;
  startedAt: string;
  stoppedAt: string | null;
  lastTickAt: string | null;
  tickCount: number;
  readingsCount: number;
  configuration: { intervalSeconds: number; scenario: string; deviceCount: number };
  startedBy: string | null;
}

export function SimulationPanel({ projectId, sessions, enabled, canControl, timeZone }: { projectId: string; sessions: SessionView[]; enabled: boolean; canControl: boolean; timeZone: string }) {
  const { run, pending } = useApiAction();
  const active = sessions.find((s) => s.status === "RUNNING" || s.status === "PAUSED");
  const [interval, setIntervalValue] = React.useState(String(active?.configuration.intervalSeconds ?? 10));
  const [scenario, setScenario] = React.useState(active?.configuration.scenario ?? "NORMAL");
  const [devices, setDevices] = React.useState(String(active?.configuration.deviceCount ?? 2));
  const [hours, setHours] = React.useState("24");

  if (!enabled) return <AlertBanner variant="warning">The simulator is disabled on this deployment. Set <code>ENABLE_SIMULATOR=true</code> (and <code>ALLOW_SIMULATOR_IN_PRODUCTION=true</code> in production) to use it.</AlertBanner>;
  const config = { intervalSeconds: Number(interval), scenario, deviceCount: Number(devices) };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">Controlled simulator {active && <Badge variant={active.status === "RUNNING" ? "success" : "warning"}>{active.status === "RUNNING" ? "Running" : "Paused"}</Badge>}</CardTitle>
          <CardDescription>Simulated devices send readings through the same ingestion and alert pipeline as hardware. Every simulated reading, device and alert is labelled SIMULATED and never presented as a real measurement. The worker process (<code>npm run worker</code>) must be running.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm"><span className="font-medium">Interval (seconds)</span><Input type="number" min={2} max={3600} value={interval} onChange={(e) => setIntervalValue(e.target.value)} disabled={!canControl} /></label>
            <label className="grid gap-1 text-sm"><span className="font-medium">Simulated devices</span><Input type="number" min={1} max={25} value={devices} onChange={(e) => setDevices(e.target.value)} disabled={!canControl} /></label>
            <label className="grid gap-1 text-sm"><span className="font-medium">Scenario</span>
              <NativeSelect value={scenario} onChange={(e) => setScenario(e.target.value)} disabled={!canControl}>{SCENARIOS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</NativeSelect>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{SCENARIOS.find((s) => s.value === scenario)?.help}</p>
          {canControl ? (
            <div className="flex flex-wrap gap-2">
              {!active && <Button disabled={pending} onClick={() => run("/api/simulations", { body: { projectId, ...config } }, "Simulation started")}><Play /> Start</Button>}
              {active?.status === "RUNNING" && <Button variant="outline" disabled={pending} onClick={() => run(`/api/simulations/${active.id}`, { method: "PATCH", body: { status: "PAUSED" } }, "Simulation paused")}><Pause /> Pause</Button>}
              {active?.status === "PAUSED" && <Button disabled={pending} onClick={() => run(`/api/simulations/${active.id}`, { method: "PATCH", body: { status: "RUNNING" } }, "Simulation resumed")}><Play /> Resume</Button>}
              {active && <Button variant="secondary" disabled={pending} onClick={() => run(`/api/simulations/${active.id}`, { method: "PATCH", body: config }, "Settings applied")}>Apply settings</Button>}
              {active && <Button variant="destructive" disabled={pending} onClick={() => run(`/api/simulations/${active.id}/stop`, { method: "POST" }, "Simulation stopped")}><Square /> Stop</Button>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">You can view simulator activity but only project managers and engineers can control it.</p>
          )}
          {active && (
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-muted-foreground">Started</dt><dd>{formatDateTime(active.startedAt, timeZone)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Last tick</dt><dd>{active.lastTickAt ? formatDateTime(active.lastTickAt, timeZone) : "Waiting for worker"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Ticks</dt><dd className="tabular-nums">{formatNumber(active.tickCount)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Readings</dt><dd className="tabular-nums">{formatNumber(active.readingsCount)}</dd></div>
            </dl>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="size-4" /> Generate history</CardTitle>
          <CardDescription>Backfills labelled simulated readings so charts and reports have data. Backfilled readings do not raise alerts.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <label className="grid gap-1 text-sm"><span className="font-medium">Hours of history</span><Input type="number" min={1} max={336} value={hours} onChange={(e) => setHours(e.target.value)} disabled={!canControl} /></label>
          <Button variant="outline" disabled={!canControl || pending} onClick={() => run("/api/simulations/history", { body: { projectId, hours: Number(hours), intervalMinutes: Number(hours) > 72 ? 30 : 10, deviceCount: Math.min(10, Number(devices)) } }, "History generated")}>Generate</Button>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Session history</CardTitle></CardHeader>
        <CardContent>
          {sessions.length === 0 ? <p className="text-sm text-muted-foreground">No simulation sessions yet.</p> : (
            <ul className="divide-y text-sm">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{formatDateTime(s.startedAt, timeZone)} · {s.configuration.scenario} · every {s.configuration.intervalSeconds}s · {s.configuration.deviceCount} device(s){s.startedBy ? ` · by ${s.startedBy}` : ""}</span>
                  <span className="flex items-center gap-2 text-muted-foreground"><span className="tabular-nums">{formatNumber(s.readingsCount)} readings</span><Badge variant={s.status === "RUNNING" ? "success" : s.status === "PAUSED" ? "warning" : "muted"}>{s.status}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
