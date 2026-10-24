"use client";

import * as React from "react";
import { Copy, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { UserRole } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/permissions/policies";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiAction } from "@/components/forms/use-api-action";

interface UserRow { id: string; name: string; email: string; role: UserRole; isActive: boolean; lastLogin: string; memberships: number }
const ROLES: UserRole[] = ["SUPER_ADMIN", "PROJECT_MANAGER", "ENGINEER", "VIEWER"];

export function TeamManager({ users, canManage, currentUserId }: { users: UserRow[]; canManage: boolean; currentUserId: string }) {
  const { run, pending } = useApiAction();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("VIEWER");
  const [invite, setInvite] = React.useState<{ link: string; emailed: boolean } | null>(null);

  return (
    <div className="grid gap-4">
      {canManage && (
        <form
          className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run<{ inviteLink: string; emailed: boolean }>("/api/users/invitations", { body: { email, role } }, "Invitation created");
            if (r) { setInvite({ link: r.inviteLink, emailed: r.emailed }); setEmail(""); }
          }}
        >
          <label className="grid gap-1 text-sm"><span className="font-medium">Invite by email</span><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></label>
          <label className="grid gap-1 text-sm"><span className="font-medium">Platform role</span><NativeSelect value={role} onChange={(e) => setRole(e.target.value as UserRole)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</NativeSelect></label>
          <Button type="submit" disabled={pending || !email}><UserPlus /> Invite</Button>
        </form>
      )}
      {invite && (
        <div className="grid gap-2 rounded-lg border border-info/30 bg-info/6 p-3 text-sm">
          <p>{invite.emailed ? "The invitation was emailed. You can also share this link:" : "Email is not configured, so share this one-time link securely. It expires in 7 days:"}</p>
          <div className="flex gap-2"><code className="min-w-0 flex-1 rounded bg-background px-2 py-1.5 font-mono text-xs break-all">{invite.link}</code><Button size="icon" variant="outline" aria-label="Copy link" onClick={() => navigator.clipboard.writeText(invite.link).then(() => toast.success("Copied"))}><Copy /></Button></div>
        </div>
      )}
      <Table>
        <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead className="hidden md:table-cell">Projects</TableHead><TableHead className="hidden sm:table-cell">Last sign-in</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
        <TableBody>
          {users.map((u) => {
            const self = u.id === currentUserId;
            return (
              <TableRow key={u.id}>
                <TableCell><div className="font-medium">{u.name}{self && <Badge variant="muted" className="ml-2">You</Badge>}</div><div className="text-xs text-muted-foreground">{u.email}</div></TableCell>
                <TableCell>
                  {canManage && !self ? (
                    <NativeSelect aria-label={`Role for ${u.name}`} className="h-8 w-40" value={u.role} disabled={pending} onChange={(e) => run(`/api/users/${u.id}`, { method: "PATCH", body: { role: e.target.value } }, "Role updated; the user's sessions were signed out")}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </NativeSelect>
                  ) : ROLE_LABELS[u.role]}
                </TableCell>
                <TableCell className="hidden tabular-nums md:table-cell">{u.memberships}</TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{u.lastLogin}</TableCell>
                <TableCell>
                  {canManage && !self ? <Switch checked={u.isActive} disabled={pending} aria-label={`${u.isActive ? "Deactivate" : "Activate"} ${u.name}`} onCheckedChange={(v) => run(`/api/users/${u.id}`, { method: "PATCH", body: { isActive: v } }, v ? "User activated" : "User deactivated")} /> : u.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Inactive</Badge>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
