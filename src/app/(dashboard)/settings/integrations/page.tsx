import { CheckCircle2, CircleSlash } from "lucide-react";
import { requirePageUser } from "@/lib/auth/session";
import { canGlobal } from "@/lib/permissions/policies";
import { integrationStatus } from "@/server/services/settings";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Integrations" };

function State({ ok, on = "Configured", off = "Not configured" }: { ok: boolean; on?: string; off?: string }) {
  return ok ? <span className="inline-flex items-center gap-1 text-sm text-[oklch(0.45_0.12_155)]"><CheckCircle2 className="size-4" /> {on}</span> : <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><CircleSlash className="size-4" /> {off}</span>;
}

export default async function IntegrationsPage() {
  const user = await requirePageUser();
  const s = integrationStatus();
  const prefix = s.mqtt.topicPrefix;
  return (
    <>
      <PageHeader title="Settings" description="Integration status comes from server environment variables. Secret values are never displayed." />
      <SettingsNav active="/settings/integrations" isAdmin={canGlobal(user, "settings.manage")} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center justify-between">MQTT <State ok={s.mqtt.configured} /></CardTitle><CardDescription>Devices publish JSON to their own telemetry topic; the worker subscribes and ingests.</CardDescription></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>Broker: <code className="font-mono">{s.mqtt.brokerUrl ?? "MQTT_BROKER_URL not set"}</code> {s.mqtt.tls && "(TLS)"}</p>
            <p>Device topic: <code className="font-mono">{prefix}/&lt;deviceIdentifier&gt;/telemetry</code></p>
            <p>Acknowledgements: <code className="font-mono">{prefix}/&lt;deviceIdentifier&gt;/ack</code></p>
            <p className="text-muted-foreground">Device username = identifier, password = device secret. Devices cannot subscribe to wildcards or other devices&apos; topics.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center justify-between">HTTP ingestion <State ok on="Enabled" /></CardTitle><CardDescription>For devices that cannot keep an MQTT connection open.</CardDescription></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>Endpoint: <code className="font-mono break-all">POST {s.httpIngestion.endpoint}</code></p>
            <p>Headers: <code className="font-mono">X-Device-Id</code>, <code className="font-mono">Authorization: Bearer &lt;secret&gt;</code></p>
            <p className="text-muted-foreground">Heartbeat timeout default: {s.heartbeatTimeoutSeconds}s.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center justify-between">Email (SMTP) <State ok={s.smtp.configured} /></CardTitle><CardDescription>Used for password resets, invitations and optional alert emails.</CardDescription></CardHeader>
          <CardContent className="text-sm">{s.smtp.configured ? <p>Host: <code className="font-mono">{s.smtp.host}</code></p> : <p className="text-muted-foreground">Without SMTP, password reset by email is unavailable and admins share invitation links manually.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center justify-between">Simulator <State ok={s.simulator.enabled} on="Enabled" off="Disabled" /></CardTitle><CardDescription>Controlled by ENABLE_SIMULATOR (and ALLOW_SIMULATOR_IN_PRODUCTION in production).</CardDescription></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Public self-registration: {s.registration.enabled ? "enabled" : "disabled (invite only)"}.</CardContent>
        </Card>
      </div>
    </>
  );
}
