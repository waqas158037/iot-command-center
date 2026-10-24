"use client";

import * as React from "react";
import { KeyRound, ShieldOff } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { useApiAction } from "@/components/forms/use-api-action";
import { SecretReveal } from "./secret-reveal";

interface Credential { id: string; secretPrefix: string; credentialVersion: number; expiresAt: string | null; revokedAt: string | null; lastUsed: string; state: "Active" | "Expiring" | "Expired" | "Revoked"; createdAt: string }

export function CredentialPanel({ deviceId, deviceIdentifier, protocol, credentials, canManage, disabled, timeZone, appUrl, topicPrefix }: {
  deviceId: string; deviceIdentifier: string; protocol: string; credentials: Credential[]; canManage: boolean; disabled: boolean; timeZone: string; appUrl: string; topicPrefix: string;
}) {
  const { run, pending } = useApiAction();
  const [grace, setGrace] = React.useState("0");
  const [secret, setSecret] = React.useState<string | null>(null);

  if (protocol === "SIMULATED") return <p className="text-sm text-muted-foreground">Simulated devices are driven by the worker and have no credentials.</p>;
  return (
    <div className="grid gap-4">
      <ul className="divide-y rounded-lg border text-sm">
        {credentials.length === 0 && <li className="p-3 text-muted-foreground">No credentials issued.</li>}
        {credentials.map((c) => {
          const s = c.state;
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="flex items-center gap-2"><KeyRound className="size-4 text-muted-foreground" /><code className="font-mono text-xs">{c.secretPrefix}…</code><span className="text-xs text-muted-foreground">v{c.credentialVersion}</span></span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Issued {formatDateTime(c.createdAt, timeZone)}</span>
                <span>· Last used {c.lastUsed}</span>
                {c.expiresAt && !c.revokedAt && <span>· Expires {formatDateTime(c.expiresAt, timeZone)}</span>}
                <Badge variant={s === "Active" ? "success" : s === "Expiring" ? "warning" : "muted"}>{s}</Badge>
              </span>
            </li>
          );
        })}
      </ul>
      {canManage && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Old secret keeps working for</span>
            <NativeSelect value={grace} onChange={(e) => setGrace(e.target.value)} className="w-44" disabled={disabled}>
              <option value="0">No grace period</option><option value="15">15 minutes</option><option value="60">1 hour</option><option value="1440">24 hours</option>
            </NativeSelect>
          </label>
          <Button disabled={pending || disabled} onClick={async () => { const r = await run<{ secret: string }>(`/api/devices/${deviceId}/credentials/rotate`, { body: { graceMinutes: Number(grace) } }, "New credential issued"); if (r) setSecret(r.secret); }}>
            <KeyRound /> Rotate credential
          </Button>
          <ConfirmDialog
            trigger={<Button variant="outline" className="text-destructive" disabled={pending || credentials.every((c) => c.revokedAt)}><ShieldOff /> Revoke all</Button>}
            title="Revoke all credentials?"
            description="The device will be rejected immediately on HTTP and MQTT until a new credential is issued."
            confirmLabel="Revoke"
            variant="destructive"
            onConfirm={async () => { await run(`/api/devices/${deviceId}/credentials/revoke`, { method: "POST" }, "Credentials revoked"); }}
          />
          {disabled && <p className="w-full text-xs text-muted-foreground">Reactivate the device to issue a credential.</p>}
        </div>
      )}
      <Dialog open={secret !== null} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New device secret</DialogTitle><DialogDescription>Update the device firmware with this secret.</DialogDescription></DialogHeader>
          {secret && <SecretReveal deviceIdentifier={deviceIdentifier} secret={secret} protocol={protocol} appUrl={appUrl} topicPrefix={topicPrefix} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
