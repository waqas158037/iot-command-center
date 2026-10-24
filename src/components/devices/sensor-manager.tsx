"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/forms/field";
import { SourceBadge } from "@/components/dashboard/status-badges";
import { useApiAction } from "@/components/forms/use-api-action";

export interface SensorView {
  id: string; sensorKey: string; name: string; sensorType: string; measurementLabel: string; unit: string; origin: string; isActive: boolean;
  minValue: number | null; maxValue: number | null;
  latest: { display: string; ago: string; source: "MQTT" | "HTTP" | "SIMULATED" } | null;
}

export function SensorManager({ deviceId, sensors, canManage, measurements }: { deviceId: string; sensors: SensorView[]; canManage: boolean; measurements: { key: string; label: string; unit: string }[] }) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ sensorKey: "", name: "", sensorType: measurements[0]?.key ?? "", origin: "MEASURED", minValue: "", maxValue: "" });
  const [error, setError] = React.useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[a-z0-9_]+$/.test(form.sensorKey)) return setError("Sensor key: lower-case letters, numbers and underscores only");
    if (form.minValue && form.maxValue && Number(form.maxValue) <= Number(form.minValue)) return setError("Maximum must be greater than minimum");
    const r = await run(`/api/devices/${deviceId}/sensors`, { body: { ...form, minValue: form.minValue || undefined, maxValue: form.maxValue || undefined } }, "Sensor added");
    if (r) { setOpen(false); setForm({ ...form, sensorKey: "", name: "" }); }
  }

  return (
    <div className="grid gap-3">
      {canManage && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline" className="w-fit"><Plus /> Add sensor</Button></DialogTrigger>
          <DialogContent>
            <form onSubmit={create} className="grid gap-4" noValidate>
              <DialogHeader><DialogTitle>Add sensor</DialogTitle><DialogDescription>Readings must use the sensor key. Values are converted to the measurement&apos;s canonical unit.</DialogDescription></DialogHeader>
              <Field id="sensorKey" label="Sensor key" required help="Used in payloads, e.g. soil_moisture"><Input className="font-mono" value={form.sensorKey} onChange={(e) => setForm({ ...form, sensorKey: e.target.value })} /></Field>
              <Field id="sensorName" label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field id="sensorType" label="Measurement" required>
                <NativeSelect value={form.sensorType} onChange={(e) => setForm({ ...form, sensorType: e.target.value })}>{measurements.map((m) => <option key={m.key} value={m.key}>{m.label} ({m.unit})</option>)}</NativeSelect>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field id="origin" label="Origin"><NativeSelect value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}><option value="MEASURED">Measured</option><option value="CALCULATED">Calculated</option><option value="EXTERNAL">External</option></NativeSelect></Field>
                <Field id="minValue" label="Valid min"><Input type="number" step="any" value={form.minValue} onChange={(e) => setForm({ ...form, minValue: e.target.value })} /></Field>
                <Field id="maxValue" label="Valid max"><Input type="number" step="any" value={form.maxValue} onChange={(e) => setForm({ ...form, maxValue: e.target.value })} /></Field>
              </div>
              {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
              <DialogFooter><Button type="submit" disabled={pending}>Add sensor</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      <Table>
        <TableHeader><TableRow><TableHead>Sensor</TableHead><TableHead>Latest</TableHead><TableHead className="hidden md:table-cell">Measurement</TableHead><TableHead className="hidden lg:table-cell">Valid range</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
        <TableBody>
          {sensors.map((s) => (
            <TableRow key={s.id}>
              <TableCell><div className="font-medium">{s.name}</div><div className="font-mono text-[11px] text-muted-foreground">{s.sensorKey}{s.origin !== "MEASURED" && ` · ${s.origin.toLowerCase()}`}</div></TableCell>
              <TableCell>{s.latest ? <><div className="font-medium tabular-nums">{s.latest.display}</div><div className="flex items-center gap-1 text-[11px] text-muted-foreground">{s.latest.ago} <SourceBadge source={s.latest.source} /></div></> : <span className="text-muted-foreground">No data</span>}</TableCell>
              <TableCell className="hidden md:table-cell">{s.measurementLabel} <span className="font-mono text-xs text-muted-foreground">({s.unit})</span></TableCell>
              <TableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">{s.minValue ?? "−∞"} – {s.maxValue ?? "∞"}</TableCell>
              <TableCell>
                {canManage ? <Switch checked={s.isActive} disabled={pending} aria-label={`${s.isActive ? "Disable" : "Enable"} ${s.name}`} onCheckedChange={(v) => run(`/api/sensors/${s.id}`, { method: "PATCH", body: { isActive: v } }, v ? "Sensor enabled" : "Sensor disabled")} /> : s.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Disabled</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {sensors.length === 0 && <p className="text-sm text-muted-foreground">No sensors configured.</p>}
      <p className="text-xs text-muted-foreground">Disabled sensors reject new readings; history is kept. Sensors with history cannot be deleted.</p>
    </div>
  );
}
