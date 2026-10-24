import { requirePageUser } from "@/lib/auth/session";
import { canGlobal } from "@/lib/permissions/policies";
import { formatRelative, sp } from "@/lib/format";
import { listUsers } from "@/server/services/users";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { FilterBar } from "@/components/forms/filter-bar";
import { Pagination } from "@/components/dashboard/pagination";
import { UnauthorizedState } from "@/components/layout/states";
import { TeamManager } from "@/components/settings/team-manager";

export const metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  const user = await requirePageUser();
  if (!canGlobal(user, "users.view")) return <UnauthorizedState message="Only super admins and project managers can view the team." />;
  const params = await searchParams;
  const q = { search: sp(params, "search"), role: sp(params, "role"), status: sp(params, "status"), page: sp(params, "page") ?? "1" };
  const result = await listUsers(user, { ...q, page: Number(q.page), pageSize: 25 });
  const canManage = canGlobal(user, "users.manage");
  return (
    <>
      <PageHeader title="Team" description={canManage ? "Manage platform roles and access. Role and status changes sign the user out of existing sessions." : "Active users you can add to your projects."} />
      <Card>
        <FilterBar action="/team" search={q.search} searchPlaceholder="Search name or email…" selects={[
          { name: "role", label: "Role", value: q.role, options: [{ value: "SUPER_ADMIN", label: "Super admin" }, { value: "PROJECT_MANAGER", label: "Project manager" }, { value: "ENGINEER", label: "Engineer" }, { value: "VIEWER", label: "Viewer" }] },
          ...(canManage ? [{ name: "status", label: "Status", value: q.status, options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] }] : []),
        ]} />
        <CardContent className="pt-4">
          <TeamManager canManage={canManage} currentUserId={user.id} users={result.items.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, lastLogin: u.lastLoginAt ? formatRelative(u.lastLoginAt) : "Never", memberships: u._count.memberships }))} />
        </CardContent>
        <Pagination page={result.page} totalPages={result.totalPages} total={result.total} basePath="/team" searchParams={q} />
      </Card>
    </>
  );
}
