"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Power, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Field } from "@/components/forms/field";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { useApiAction } from "@/components/forms/use-api-action";

interface Editable { name: string; hardwareModel: string; firmwareVersion: string; locationDescription: string; latitude: string; longitude: string; heartbeatTimeoutSec: string }

export function DeviceActions({ deviceId, device, canUpdate, canConfigure, canDeactivate, disabled }: { deviceId: string; device: Editable; canUpdate: boolean; canConfigure: boolean; canDeactivate: boolean; disabled: boolean }) {
  const router = useRouter();
  const { run, pending } = useApiAction();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(device);
  const [error, setError] = React.useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const numOrNull = (v: string) => (v === "" ? null : Number(v));
    const body = canUpdate
      ? { ...form, latitude: numOrNull(form.latitude), longitude: numOrNull(form.longitude), heartbeatTimeoutSec: numOrNull(form.heartbeatTimeoutSec) }
      : { firmwareVersion: form.firmwareVersion, heartbeatTimeoutSec: numOrNull(form.heartbeatTimeoutSec) };
    try {
      await apiFetch(`/api/devices/${deviceId}`, { method: "PATCH", body });
      toast.success("Device updated");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  const f = (key: keyof Editable, label: string, opts: { type?: string; full?: boolean; restricted?: boolean } = {}) => (
    <Field id={`dev-${key}`} label={label} className={opts.full ? "sm:col-span-2" : undefined}>
      <Input type={opts.type ?? "text"} step="any" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} disabled={opts.restricted && !canUpdate} />
    </Field>
  );

  return (
    <>
      {(canUpdate || canConfigure) && !disabled && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" variant="secondary"><Pencil /> Edit</Button></DialogTrigger>
          <DialogContent className="max-w-xl">
            <form onSubmit={save} className="grid gap-4" noValidate>
              <DialogHeader><DialogTitle>Edit device</DialogTitle>{!canUpdate && <DialogDescription>Engineers can change firmware version and heartbeat timeout only.</DialogDescription>}</DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                {f("name", "Name", { full: true, restricted: true })}
                {f("hardwareModel", "Hardware model", { restricted: true })}
                {f("firmwareVersion", "Firmware version")}
                {f("locationDescription", "Location", { full: true, restricted: true })}
                {f("latitude", "Latitude", { type: "number", restricted: true })}
                {f("longitude", "Longitude", { type: "number", restricted: true })}
                {f("heartbeatTimeoutSec", "Heartbeat timeout (s)", { type: "number" })}
              </div>
              {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
              <DialogFooter><Button type="submit">Save</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {canDeactivate && (disabled ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(`/api/devices/${deviceId}`, { method: "PATCH", body: { active: true } }, "Device reactivated")}><Power /> Reactivate</Button>
      ) : (
        <ConfirmDialog
          trigger={<Button size="sm" variant="outline"><Power /> Deactivate</Button>}
          title="Deactivate device?"
          description="The device is marked Disabled, its credentials are revoked and its readings are rejected. History is kept."
          confirmLabel="Deactivate"
          variant="destructive"
          onConfirm={async () => { await run(`/api/devices/${deviceId}`, { method: "PATCH", body: { active: false } }, "Device deactivated"); }}
        />
      ))}
      {canDeactivate && (
        <ConfirmDialog
          trigger={<Button size="sm" variant="ghost" className="text-destructive"><Trash2 /> Delete</Button>}
          title="Delete device?"
          description="Only devices without telemetry can be deleted. Devices with history must be deactivated so records are preserved."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={async () => {
            try {
              await apiFetch(`/api/devices/${deviceId}`, { method: "DELETE" });
              toast.success("Device deleted");
              router.push("/devices");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not delete");
            }
          }}
        />
      )}
    </>
  );
}
