"use client";

import * as React from "react";
import { Trash2, UserPlus } from "lucide-react";
import type { ProjectRole, UserRole } from "@prisma/client";
import { PROJECT_ROLE_LABELS, ROLE_LABELS } from "@/lib/permissions/policies";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { useApiAction } from "@/components/forms/use-api-action";

interface Member { id: string; projectRole: ProjectRole; user: { id: string; name: string; email: string; role: UserRole; isActive: boolean } }
const CAP: Record<UserRole, ProjectRole[]> = { SUPER_ADMIN: ["MANAGER", "ENGINEER", "VIEWER"], PROJECT_MANAGER: ["MANAGER", "ENGINEER", "VIEWER"], ENGINEER: ["ENGINEER", "VIEWER"], VIEWER: ["VIEWER"] };

export function MembersManager({ projectId, members, candidates, canManage, ownerId }: {
  projectId: string;
  members: Member[];
  candidates: { id: string; name: string; email: string; role: UserRole }[];
  canManage: boolean;
  ownerId: string;
}) {
  const { run, pending } = useApiAction();
  const [userId, setUserId] = React.useState("");
  const [role, setRole] = React.useState<ProjectRole>("VIEWER");
  const available = candidates.filter((c) => !members.some((m) => m.user.id === c.id));
  const chosen = available.find((c) => c.id === userId);
  const allowed = chosen ? CAP[chosen.role] : (["MANAGER", "ENGINEER", "VIEWER"] as ProjectRole[]);

  return (
    <div className="grid gap-4">
      {canManage && (
        <form
          className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!userId) return;
            const ok = await run(`/api/projects/${projectId}/members`, { body: { userId, projectRole: role } }, "Member added");
            if (ok) setUserId("");
          }}
        >
          <label className="grid flex-1 gap-1 text-sm">
            <span className="font-medium">Add a user</span>
            <NativeSelect value={userId} onChange={(e) => { setUserId(e.target.value); const c = available.find((x) => x.id === e.target.value); if (c && !CAP[c.role].includes(role)) setRole(CAP[c.role][0]); }}>
              <option value="">Select a user…</option>
              {available.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email}) · {ROLE_LABELS[c.role]}</option>)}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm sm:w-44">
            <span className="font-medium">Project role</span>
            <NativeSelect value={role} onChange={(e) => setRole(e.target.value as ProjectRole)}>
              {allowed.map((r) => <option key={r} value={r}>{PROJECT_ROLE_LABELS[r]}</option>)}
            </NativeSelect>
          </label>
          <Button type="submit" disabled={!userId || pending}><UserPlus /> Add member</Button>
        </form>
      )}
      <Table>
        <TableHeader>
          <TableRow><TableHead>Member</TableHead><TableHead className="hidden sm:table-cell">Platform role</TableHead><TableHead>Project role</TableHead>{canManage && <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>}</TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <div className="font-medium">{m.user.name} {m.user.id === ownerId && <Badge variant="muted" className="ml-1">Owner</Badge>} {!m.user.isActive && <Badge variant="danger" className="ml-1">Inactive</Badge>}</div>
                <div className="text-xs text-muted-foreground">{m.user.email}</div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">{ROLE_LABELS[m.user.role]}</TableCell>
              <TableCell>
                {canManage ? (
                  <NativeSelect aria-label={`Project role for ${m.user.name}`} className="h-8 w-36" value={m.projectRole} disabled={pending} onChange={(e) => run(`/api/projects/${projectId}/members/${m.user.id}`, { method: "PATCH", body: { projectRole: e.target.value } }, "Role updated")}>
                    {CAP[m.user.role].map((r) => <option key={r} value={r}>{PROJECT_ROLE_LABELS[r]}</option>)}
                  </NativeSelect>
                ) : PROJECT_ROLE_LABELS[m.projectRole]}
              </TableCell>
              {canManage && (
                <TableCell>
                  {m.user.id !== ownerId && (
                    <ConfirmDialog
                      trigger={<Button variant="ghost" size="icon" aria-label={`Remove ${m.user.name}`}><Trash2 /></Button>}
                      title="Remove member?"
                      description={`${m.user.name} will lose access to this project immediately.`}
                      confirmLabel="Remove"
                      variant="destructive"
                      onConfirm={async () => { await run(`/api/projects/${projectId}/members/${m.user.id}`, { method: "DELETE" }, "Member removed"); }}
                    />
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">A member&apos;s effective permissions are capped by their platform role: viewers can only be project viewers and engineers cannot be project managers.</p>
    </div>
  );
}
