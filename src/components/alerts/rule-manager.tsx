"use client";

import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { AlertConditionType, AlertSeverity } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/forms/field";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { useApiAction } from "@/components/forms/use-api-action";

export interface RuleView {
  id: string; name: string; description: string; conditionType: AlertConditionType; severity: AlertSeverity; isEnabled: boolean;
  sensorType: string | null; deviceId: string | null; sensorId: string | null; threshold: Record<string, number>;
  consecutiveCount: number; cooldownSeconds: number; autoResolve: boolean; summary: string; target: string; alertCount: number;
}

const CONDITIONS: { value: AlertConditionType; label: string; fields: ("value" | "min" | "max" | "state" | "missingSeconds")[]; needsSensor: boolean }[] = [
  { value: "THRESHOLD_ABOVE", label: "Value above threshold", fields: ["value"], needsSensor: true },
  { value: "THRESHOLD_BELOW", label: "Value below threshold", fields: ["value"], needsSensor: true },
  { value: "OUTSIDE_RANGE", label: "Value outside range", fields: ["min", "max"], needsSensor: true },
  { value: "INSIDE_RANGE", label: "Value inside range", fields: ["min", "max"], needsSensor: true },
  { value: "STATE_EQUALS", label: "State equals", fields: ["state"], needsSensor: true },
  { value: "BATTERY_LOW", label: "Battery low", fields: ["value"], needsSensor: false },
  { value: "DEVICE_OFFLINE", label: "Device offline", fields: [], needsSensor: false },
  { value: "MISSING_READINGS", label: "Missing readings", fields: ["missingSeconds"], needsSensor: false },
];
const SEVERITIES: AlertSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const FIELD_LABEL = { value: "Threshold", min: "Minimum", max: "Maximum", state: "State code", missingSeconds: "No data for (seconds)" };

type Form = { name: string; description: string; conditionType: AlertConditionType; severity: AlertSeverity; sensorType: string; deviceId: string; sensorId: string; value: string; min: string; max: string; state: string; missingSeconds: string; consecutiveCount: string; cooldownSeconds: string; autoResolve: boolean };
const empty: Form = { name: "", description: "", conditionType: "THRESHOLD_ABOVE", severity: "MEDIUM", sensorType: "", deviceId: "", sensorId: "", value: "", min: "", max: "", state: "", missingSeconds: "300", consecutiveCount: "1", cooldownSeconds: "300", autoResolve: true };

export function RuleManager({ projectId, rules, canManage, measurements, devices }: {
  projectId: string; rules: RuleView[]; canManage: boolean;
  measurements: { key: string; label: string; unit: string }[];
  devices: { id: string; name: string; sensors: { id: string; name: string; sensorType: string }[] }[];
}) {
  const { run, pending } = useApiAction();
  const [editing, setEditing] = React.useState<RuleView | "new" | null>(null);
  const [form, setForm] = React.useState<Form>(empty);
  const [error, setError] = React.useState<string | null>(null);
  const cond = CONDITIONS.find((c) => c.value === form.conditionType)!;
  const device = devices.find((d) => d.id === form.deviceId);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  function open(rule: RuleView | "new") {
    setError(null);
    setEditing(rule);
    if (rule === "new") return setForm({ ...empty, sensorType: measurements[0]?.key ?? "" });
    const t = rule.threshold;
    setForm({ name: rule.name, description: rule.description, conditionType: rule.conditionType, severity: rule.severity, sensorType: rule.sensorType ?? "", deviceId: rule.deviceId ?? "", sensorId: rule.sensorId ?? "", value: t.value?.toString() ?? "", min: t.min?.toString() ?? "", max: t.max?.toString() ?? "", state: t.state?.toString() ?? "", missingSeconds: t.missingSeconds?.toString() ?? "300", consecutiveCount: String(rule.consecutiveCount), cooldownSeconds: String(rule.cooldownSeconds), autoResolve: rule.autoResolve });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.name.trim().length < 3) return setError("Name must be at least 3 characters");
    const threshold: Record<string, number> = {};
    for (const f of cond.fields) {
      if (form[f] === "" || Number.isNaN(Number(form[f]))) return setError(`${FIELD_LABEL[f]} is required`);
      threshold[f] = Number(form[f]);
    }
    if (cond.fields.includes("min") && threshold.max <= threshold.min) return setError("Maximum must be greater than minimum");
    if (cond.needsSensor && !form.sensorId && !form.sensorType) return setError("Choose a sensor or a measurement type");
    const body = {
      name: form.name, description: form.description, conditionType: form.conditionType, severity: form.severity, thresholdConfiguration: threshold,
      sensorType: form.sensorId ? null : form.conditionType === "BATTERY_LOW" ? "battery" : cond.needsSensor ? form.sensorType || null : null,
      deviceId: form.deviceId || null, sensorId: form.sensorId || null,
      consecutiveCount: Number(form.consecutiveCount), cooldownSeconds: Number(form.cooldownSeconds), autoResolve: form.autoResolve,
    };
    const r = editing === "new"
      ? await run("/api/alert-rules", { body: { ...body, projectId } }, "Rule created")
      : await run(`/api/alert-rules/${(editing as RuleView).id}`, { method: "PATCH", body }, "Rule saved");
    if (r) setEditing(null);
  }

  return (
    <div className="grid gap-3">
      {canManage && <Button size="sm" className="w-fit" onClick={() => open("new")}><Plus /> New rule</Button>}
      <Table>
        <TableHeader><TableRow><TableHead>Rule</TableHead><TableHead>Severity</TableHead><TableHead className="hidden md:table-cell">Condition</TableHead><TableHead className="hidden lg:table-cell">Applies to</TableHead><TableHead>Enabled</TableHead>{canManage && <TableHead className="w-24"><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
        <TableBody>
          {rules.map((r) => (
            <TableRow key={r.id}>
              <TableCell><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.alertCount} alert(s) · ×{r.consecutiveCount} consecutive · {r.cooldownSeconds}s cooldown{r.autoResolve ? " · auto-resolve" : ""}</div></TableCell>
              <TableCell><Badge variant={r.severity === "CRITICAL" || r.severity === "HIGH" ? "danger" : r.severity === "MEDIUM" ? "warning" : "info"}>{r.severity.charAt(0) + r.severity.slice(1).toLowerCase()}</Badge></TableCell>
              <TableCell className="hidden md:table-cell">{r.summary}</TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">{r.target}</TableCell>
              <TableCell>{canManage ? <Switch checked={r.isEnabled} disabled={pending} aria-label={`Enable ${r.name}`} onCheckedChange={(v) => run(`/api/alert-rules/${r.id}`, { method: "PATCH", body: { isEnabled: v } }, v ? "Rule enabled" : "Rule disabled")} /> : r.isEnabled ? "On" : "Off"}</TableCell>
              {canManage && (
                <TableCell className="whitespace-nowrap">
                  <Button variant="ghost" size="icon" aria-label={`Edit ${r.name}`} onClick={() => open(r)}><Pencil /></Button>
                  <ConfirmDialog trigger={<Button variant="ghost" size="icon" aria-label={`Delete ${r.name}`}><Trash2 /></Button>} title="Delete rule?" description="Rules that have raised alerts are disabled instead of deleted, so alert history stays linked." confirmLabel="Delete" variant="destructive" onConfirm={async () => { await run(`/api/alert-rules/${r.id}`, { method: "DELETE" }, "Rule removed"); }} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rules.length === 0 && <p className="text-sm text-muted-foreground">No rules for this project.</p>}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <form onSubmit={save} className="grid gap-4" noValidate>
            <DialogHeader><DialogTitle>{editing === "new" ? "New alert rule" : "Edit alert rule"}</DialogTitle><DialogDescription>Above/below are strict; ranges include their endpoints.</DialogDescription></DialogHeader>
            <Field id="r-name" label="Name" required><Input value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="r-cond" label="Condition"><NativeSelect value={form.conditionType} onChange={(e) => set({ conditionType: e.target.value as AlertConditionType })}>{CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</NativeSelect></Field>
              <Field id="r-sev" label="Severity"><NativeSelect value={form.severity} onChange={(e) => set({ severity: e.target.value as AlertSeverity })}>{SEVERITIES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}</NativeSelect></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="r-device" label="Device" help="Blank = every device in the project"><NativeSelect value={form.deviceId} onChange={(e) => set({ deviceId: e.target.value, sensorId: "" })}><option value="">All devices</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</NativeSelect></Field>
              {cond.needsSensor && (device ? (
                <Field id="r-sensor" label="Sensor"><NativeSelect value={form.sensorId} onChange={(e) => set({ sensorId: e.target.value })}><option value="">By measurement type</option>{device.sensors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
              ) : <span />)}
            </div>
            {cond.needsSensor && !form.sensorId && (
              <Field id="r-type" label="Measurement type" help="Applies to every sensor of this type"><NativeSelect value={form.sensorType} onChange={(e) => set({ sensorType: e.target.value })}>{measurements.map((m) => <option key={m.key} value={m.key}>{m.label} ({m.unit})</option>)}</NativeSelect></Field>
            )}
            {cond.fields.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {cond.fields.map((f) => <Field key={f} id={`r-${f}`} label={FIELD_LABEL[f]} required><Input type="number" step="any" value={form[f]} onChange={(e) => set({ [f]: e.target.value } as Partial<Form>)} /></Field>)}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="r-consec" label="Consecutive readings" help="Readings in a row before alerting"><Input type="number" min={1} max={100} value={form.consecutiveCount} onChange={(e) => set({ consecutiveCount: e.target.value })} /></Field>
              <Field id="r-cool" label="Cooldown (seconds)" help="Quiet period after resolution"><Input type="number" min={0} value={form.cooldownSeconds} onChange={(e) => set({ cooldownSeconds: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={form.autoResolve} onChange={(e) => set({ autoResolve: e.target.checked })} /> Resolve automatically when values return to normal</label>
            <Field id="r-desc" label="Description"><Textarea rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
            {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
            <DialogFooter><Button type="submit" disabled={pending}>Save rule</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
