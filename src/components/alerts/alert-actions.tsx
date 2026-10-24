"use client";

import * as React from "react";
import { Check, CheckCheck, MessageSquarePlus } from "lucide-react";
import type { AlertStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useApiAction } from "@/components/forms/use-api-action";

export function AlertActions({ alertId, status, canAcknowledge, canResolve, canNote }: { alertId: string; status: AlertStatus; canAcknowledge: boolean; canResolve: boolean; canNote: boolean }) {
  const { run, pending } = useApiAction();
  const [notes, setNotes] = React.useState("");
  const act = async (action: "acknowledge" | "resolve" | "note", msg: string) => {
    const r = await run(`/api/alerts/${alertId}`, { method: "PATCH", body: { action, notes: notes.trim() || undefined } }, msg);
    if (r) setNotes("");
  };
  if (!canAcknowledge && !canResolve && !canNote) return <p className="text-sm text-muted-foreground">Your role can view this alert but not act on it.</p>;
  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Notes</span>
        <Textarea rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was checked or done? (optional for acknowledge/resolve)" />
      </label>
      <div className="flex flex-wrap gap-2">
        {canAcknowledge && status === "ACTIVE" && <Button disabled={pending} onClick={() => act("acknowledge", "Alert acknowledged")}><Check /> Acknowledge</Button>}
        {canResolve && status !== "RESOLVED" && <Button variant="secondary" disabled={pending} onClick={() => act("resolve", "Alert resolved")}><CheckCheck /> Resolve</Button>}
        {canNote && <Button variant="outline" disabled={pending || !notes.trim()} onClick={() => act("note", "Note added")}><MessageSquarePlus /> Add note</Button>}
      </div>
    </div>
  );
}
