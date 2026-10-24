"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import type { ConfigField } from "@/lib/project-types/types";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { Switch } from "@/components/ui/switch";
import { AlertBanner } from "@/components/ui/alert-banner";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";

type SettingValue = string | number | boolean;
const toDate = (d: string | null) => (d ? d.slice(0, 10) : "");

export function ProjectSettingsForm({ project, fields, canUpdate, canArchive }: {
  project: { id: string; name: string; description: string; status: ProjectStatus; startedAt: string | null; endedAt: string | null; settings: Record<string, SettingValue>; archived: boolean };
  fields: ConfigField[];
  canUpdate: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState({ name: project.name, description: project.description, status: project.status, startedAt: toDate(project.startedAt), endedAt: toDate(project.endedAt) });
  const [settings, setSettings] = React.useState<Record<string, SettingValue>>(() => Object.fromEntries(fields.map((f) => [f.key, project.settings[f.key] ?? f.default])));
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const disabled = !canUpdate || saving;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.name.trim().length < 3) return setError("Name must be at least 3 characters");
    if (form.startedAt && form.endedAt && form.endedAt < form.startedAt) return setError("End date must be after the start date");
    setSaving(true);
    try {
      await apiFetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: { ...form, startedAt: form.startedAt || null, endedAt: form.endedAt || null, settings: Object.fromEntries(fields.map((f) => [f.key, f.type === "number" ? Number(settings[f.key]) : settings[f.key]])) },
      });
      toast.success("Project saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-5" noValidate>
      {!canUpdate && <AlertBanner variant="info">{project.archived ? "Archived projects are read-only." : "You can view these settings but your project role cannot change them."}</AlertBanner>}
      <Card>
        <CardHeader><CardTitle>General</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Name" required className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={disabled} /></Field>
          <Field id="status" label="Status">
            <NativeSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })} disabled={disabled}>
              {["PLANNING", "ACTIVE", "PAUSED", "COMPLETED"].map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
              {project.archived && <option value="ARCHIVED">Archived</option>}
            </NativeSelect>
          </Field>
          <div />
          <Field id="startedAt" label="Start date"><Input type="date" value={form.startedAt} onChange={(e) => setForm({ ...form, startedAt: e.target.value })} disabled={disabled} /></Field>
          <Field id="endedAt" label="End date"><Input type="date" value={form.endedAt} onChange={(e) => setForm({ ...form, endedAt: e.target.value })} disabled={disabled} /></Field>
          <Field id="description" label="Description" className="sm:col-span-2"><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={disabled} /></Field>
        </CardContent>
      </Card>
      {fields.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Project-type settings</CardTitle><CardDescription>These apply to this project only. Template defaults for other projects are unchanged.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => {
              const id = `setting-${f.key}`;
              const label = f.unit ? `${f.label} (${f.unit})` : f.label;
              if (f.type === "boolean") {
                return (
                  <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <label htmlFor={id} className="text-sm"><span className="font-medium">{f.label}</span>{f.help && <span className="block text-xs text-muted-foreground">{f.help}</span>}</label>
                    <Switch id={id} checked={Boolean(settings[f.key])} onCheckedChange={(v) => setSettings({ ...settings, [f.key]: v })} disabled={disabled} />
                  </div>
                );
              }
              return (
                <Field key={f.key} id={id} label={label} help={f.help ?? (f.min !== undefined || f.max !== undefined ? `Range ${f.min ?? "−∞"}–${f.max ?? "∞"}` : undefined)}>
                  {f.type === "select" ? (
                    <NativeSelect value={String(settings[f.key])} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} disabled={disabled}>{(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</NativeSelect>
                  ) : (
                    <Input type={f.type === "number" ? "number" : "text"} min={f.min} max={f.max} step="any" value={String(settings[f.key])} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} disabled={disabled} />
                  )}
                </Field>
              );
            })}
          </CardContent>
        </Card>
      )}
      {error && <AlertBanner variant="danger" role="alert">{error}</AlertBanner>}
      <div className="flex flex-wrap justify-between gap-2">
        {canArchive && !project.archived ? (
          <ConfirmDialog
            trigger={<Button type="button" variant="outline" className="text-destructive"><Archive /> Archive project</Button>}
            title="Archive this project?"
            description="The project becomes read-only. Devices stop being managed, but all historical telemetry, alerts and audit records are kept. A super admin or manager can restore it by changing its status."
            confirmLabel="Archive"
            variant="destructive"
            onConfirm={async () => {
              try {
                await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" });
                toast.success("Project archived");
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not archive");
              }
            }}
          />
        ) : <span />}
        {canUpdate && <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>}
      </div>
    </form>
  );
}
