"use client";

import * as React from "react";
import { useActionState } from "react";
import type { AlertSeverity } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { AlertBanner } from "@/components/ui/alert-banner";
import { passwordAction, platformSettingsAction, preferencesAction, profileAction, type SettingsState } from "@/app/(dashboard)/settings/actions";

function Status({ state }: { state: SettingsState }) {
  if (state.error) return <AlertBanner variant="danger" role="alert">{state.error}</AlertBanner>;
  if (state.success) return <AlertBanner variant="success" role="status">{state.success}</AlertBanner>;
  return null;
}

export function ProfileForm({ name, email, timezone, timezones }: { name: string; email: string; timezone: string; timezones: string[] }) {
  const [state, action, pending] = useActionState(profileAction, {});
  return (
    <Card>
      <CardHeader><CardTitle>Profile</CardTitle><CardDescription>Dates and charts are shown in your time zone.</CardDescription></CardHeader>
      <CardContent>
        <form action={action} className="grid max-w-xl gap-4">
          <Field id="email" label="Email"><Input value={email} disabled readOnly /></Field>
          <Field id="name" label="Name" required><Input name="name" defaultValue={name} minLength={2} maxLength={100} /></Field>
          <Field id="timezone" label="Time zone"><NativeSelect name="timezone" defaultValue={timezone}>{timezones.map((t) => <option key={t} value={t}>{t}</option>)}</NativeSelect></Field>
          <Status state={state} />
          <Button type="submit" className="w-fit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(passwordAction, {});
  return (
    <Card>
      <CardHeader><CardTitle>Change password</CardTitle><CardDescription>At least 10 characters with letters and numbers. All sessions are signed out afterwards.</CardDescription></CardHeader>
      <CardContent>
        <form action={action} className="grid max-w-xl gap-4">
          <Field id="current" label="Current password" required><Input name="current" type="password" autoComplete="current-password" /></Field>
          <Field id="next" label="New password" required><Input name="next" type="password" autoComplete="new-password" minLength={10} /></Field>
          <Field id="confirm" label="Confirm new password" required><Input name="confirm" type="password" autoComplete="new-password" /></Field>
          <Status state={state} />
          <Button type="submit" className="w-fit" disabled={pending}>{pending ? "Changing…" : "Change password"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function PreferencesForm({ prefs, emailAvailable }: { prefs: { minSeverity: AlertSeverity; deviceOffline: boolean; alertUpdates: boolean; email: boolean }; emailAvailable: boolean }) {
  const [state, action, pending] = useActionState(preferencesAction, {});
  const check = (name: string, label: string, help: string, checked: boolean, disabled = false) => (
    <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} disabled={disabled} className="mt-0.5 size-4 accent-[var(--primary)]" />
      <span><span className="font-medium">{label}</span><span className="block text-xs text-muted-foreground">{help}</span></span>
    </label>
  );
  return (
    <Card>
      <CardHeader><CardTitle>Notification preferences</CardTitle><CardDescription>You are only notified about projects you belong to. Critical alerts are always delivered in-app.</CardDescription></CardHeader>
      <CardContent>
        <form action={action} className="grid max-w-xl gap-4">
          <Field id="minSeverity" label="Minimum alert severity"><NativeSelect name="minSeverity" defaultValue={prefs.minSeverity}>{["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()} and above</option>)}</NativeSelect></Field>
          {check("deviceOffline", "Device offline", "When a device stops sending heartbeats.", prefs.deviceOffline)}
          {check("alertUpdates", "Alert updates", "When someone acknowledges or resolves an alert.", prefs.alertUpdates)}
          {check("email", "Email copies", emailAvailable ? "Also send notifications by email." : "Email is not configured on this deployment (SMTP settings missing).", prefs.email && emailAvailable, !emailAvailable)}
          <Status state={state} />
          <Button type="submit" className="w-fit" disabled={pending}>{pending ? "Saving…" : "Save preferences"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function PlatformForm({ settings }: { settings: { organizationName: string; telemetryRetentionDays: number; sensitiveDataRetentionDays: number } }) {
  const [state, action, pending] = useActionState(platformSettingsAction, {});
  return (
    <Card>
      <CardHeader><CardTitle>Platform settings</CardTitle><CardDescription>Retention is applied by the worker&apos;s daily retention job. 0 keeps general telemetry forever.</CardDescription></CardHeader>
      <CardContent>
        <form action={action} className="grid max-w-xl gap-4">
          <Field id="organizationName" label="Organisation name"><Input name="organizationName" defaultValue={settings.organizationName} /></Field>
          <Field id="telemetryRetentionDays" label="Telemetry retention (days)"><Input type="number" min={0} max={3650} name="telemetryRetentionDays" defaultValue={settings.telemetryRetentionDays} /></Field>
          <Field id="sensitiveDataRetentionDays" label="Health-project telemetry retention (days)" help="Applies to sensitive (health) project types."><Input type="number" min={1} max={3650} name="sensitiveDataRetentionDays" defaultValue={settings.sensitiveDataRetentionDays} /></Field>
          <Status state={state} />
          <Button type="submit" className="w-fit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
