"use client";

import * as React from "react";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertBanner } from "@/components/ui/alert-banner";

/** Shows a newly issued device secret exactly once. It is never retrievable again. */
export function SecretReveal({ deviceIdentifier, secret, protocol, appUrl, topicPrefix }: { deviceIdentifier: string; secret: string; protocol: string; appUrl: string; topicPrefix: string }) {
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success("Copied"), () => toast.error("Copy failed"));
  const topic = `${topicPrefix}/${deviceIdentifier}/telemetry`;
  const curl = `curl -X POST ${appUrl}/api/ingest/telemetry \\\n  -H "Content-Type: application/json" \\\n  -H "X-Device-Id: ${deviceIdentifier}" \\\n  -H "Authorization: Bearer <DEVICE_SECRET>" \\\n  -d '{"readings":[{"sensorKey":"temperature","value":24.5,"unit":"°C"}]}'`;
  return (
    <div className="grid gap-3">
      <AlertBanner variant="warning"><KeyRound className="size-4 shrink-0" /><span><strong>Copy this secret now.</strong> It is stored only as a hash and will never be shown again. If it is lost, rotate the credential.</span></AlertBanner>
      <div className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">Device identifier</span>
        <code className="rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">{deviceIdentifier}</code>
      </div>
      <div className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">Device secret</span>
        <div className="flex gap-2">
          <code data-testid="device-secret" className="min-w-0 flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">{secret}</code>
          <Button type="button" variant="outline" size="icon" onClick={() => copy(secret)} aria-label="Copy secret"><Copy /></Button>
        </div>
      </div>
      {protocol === "MQTT" ? (
        <div className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">MQTT connection</span>
          <p>Username: <code className="font-mono">{deviceIdentifier}</code> · Password: the secret above</p>
          <p>Publish to: <code className="font-mono break-all">{topic}</code></p>
        </div>
      ) : (
        <div className="grid gap-1">
          <span className="text-xs font-medium text-muted-foreground">HTTP example</span>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{curl}</pre>
        </div>
      )}
    </div>
  );
}
