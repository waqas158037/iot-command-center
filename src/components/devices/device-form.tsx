"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { AlertBanner } from "@/components/ui/alert-banner";
import { SecretReveal } from "./secret-reveal";

const optNum = (min: number, max: number) => z.string().refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= min && Number(v) <= max), `Enter a number between ${min} and ${max}`);
const schema = z.object({
  projectId: z.string().min(1, "Choose a project"),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  deviceIdentifier: z.string().trim().max(64).regex(/^$|^[a-zA-Z0-9][a-zA-Z0-9_-]{2,}$/, "3–64 letters, numbers, hyphens or underscores"),
  protocol: z.enum(["MQTT", "HTTP", "SIMULATED"]),
  hardwareModel: z.string().max(120),
  firmwareVersion: z.string().max(60),
  locationDescription: z.string().max(200),
  latitude: optNum(-90, 90),
  longitude: optNum(-180, 180),
  heartbeatTimeoutSec: optNum(10, 604800),
  createTemplateSensors: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function DeviceCreateForm({ projects, initialProjectId, appUrl, topicPrefix, simulatorEnabled }: { projects: { value: string; label: string }[]; initialProjectId?: string; appUrl: string; topicPrefix: string; simulatorEnabled: boolean }) {
  const router = useRouter();
  const [created, setCreated] = React.useState<{ id: string; deviceIdentifier: string; protocol: string; secret: string | null } | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { projectId: initialProjectId ?? "", name: "", deviceIdentifier: "", protocol: "MQTT", hardwareModel: "", firmwareVersion: "", locationDescription: "", latitude: "", longitude: "", heartbeatTimeoutSec: "", createTemplateSensors: true },
  });

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      const res = await apiFetch<{ device: { id: string; deviceIdentifier: string; protocol: string }; secret: string | null }>("/api/devices", {
        body: { ...v, deviceIdentifier: v.deviceIdentifier || undefined, latitude: v.latitude || undefined, longitude: v.longitude || undefined, heartbeatTimeoutSec: v.heartbeatTimeoutSec || undefined },
      });
      toast.success("Device registered");
      setCreated({ id: res.device.id, deviceIdentifier: res.device.deviceIdentifier, protocol: res.device.protocol, secret: res.secret });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) setError("deviceIdentifier", { message: "This identifier is already registered" });
      else setServerError(err instanceof Error ? err.message : "Could not register the device");
    }
  });

  if (created) {
    return (
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Device registered</CardTitle><CardDescription>Status is <strong>Unknown</strong> until the device sends its first reading or heartbeat.</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          {created.secret ? <SecretReveal deviceIdentifier={created.deviceIdentifier} secret={created.secret} protocol={created.protocol} appUrl={appUrl} topicPrefix={topicPrefix} /> : <p className="text-sm">Simulated devices do not use credentials. Start the project simulator to make it report.</p>}
          <div className="flex gap-2"><Button asChild><Link href={`/devices/${created.id}`}>Open device</Link></Button><Button variant="outline" onClick={() => { setCreated(null); router.refresh(); }}>Register another</Button></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-3xl gap-5">
      <Card>
        <CardHeader><CardTitle>Device details</CardTitle><CardDescription>Sensors from the project&apos;s template are created automatically unless you opt out.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="projectId" label="Project" required error={errors.projectId?.message} className="sm:col-span-2">
            <NativeSelect {...register("projectId")}><option value="">Select a project…</option>{projects.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</NativeSelect>
          </Field>
          <Field id="name" label="Device name" required error={errors.name?.message}><Input {...register("name")} /></Field>
          <Field id="protocol" label="Protocol" required error={errors.protocol?.message}>
            <NativeSelect {...register("protocol")}><option value="MQTT">MQTT</option><option value="HTTP">HTTP</option>{simulatorEnabled && <option value="SIMULATED">Simulated (no hardware)</option>}</NativeSelect>
          </Field>
          <Field id="deviceIdentifier" label="Device identifier" error={errors.deviceIdentifier?.message} help="Leave blank to generate one. Used as the MQTT username and in topics."><Input {...register("deviceIdentifier")} className="font-mono" /></Field>
          <Field id="heartbeatTimeoutSec" label="Heartbeat timeout (seconds)" error={errors.heartbeatTimeoutSec?.message} help="Blank uses the platform default."><Input type="number" {...register("heartbeatTimeoutSec")} /></Field>
          <Field id="hardwareModel" label="Hardware model" error={errors.hardwareModel?.message}><Input placeholder="ESP32-WROOM-32" {...register("hardwareModel")} /></Field>
          <Field id="firmwareVersion" label="Firmware version" error={errors.firmwareVersion?.message}><Input placeholder="1.0.0" {...register("firmwareVersion")} /></Field>
          <Field id="locationDescription" label="Location" error={errors.locationDescription?.message} className="sm:col-span-2"><Input placeholder="Greenhouse 2, bench A" {...register("locationDescription")} /></Field>
          <Field id="latitude" label="Latitude" error={errors.latitude?.message}><Input inputMode="decimal" {...register("latitude")} /></Field>
          <Field id="longitude" label="Longitude" error={errors.longitude?.message}><Input inputMode="decimal" {...register("longitude")} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("createTemplateSensors")} /> Create sensors from the project template</label>
        </CardContent>
      </Card>
      {serverError && <AlertBanner variant="danger" role="alert">{serverError}</AlertBanner>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Registering…" : "Register device"}</Button></div>
    </form>
  );
}
