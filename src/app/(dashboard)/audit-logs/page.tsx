import { requirePageUser } from "@/lib/auth/session";
import { canGlobal } from "@/lib/permissions/policies";
import { formatDateTime, RANGE_OPTIONS, resolveRange, sp } from "@/lib/format";
import { listAuditLogs } from "@/server/services/users";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FilterBar } from "@/components/forms/filter-bar";
import { Pagination } from "@/components/dashboard/pagination";
import { UnauthorizedState } from "@/components/layout/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Audit logs" };

export default async function AuditLogsPage({ searchParams }: PageProps<"/audit-logs">) {
  const user = await requirePageUser();
  if (!canGlobal(user, "audit.view")) return <UnauthorizedState message="Only super admins can view audit logs." />;
  const params = await searchParams;
  const { from, to } = resolveRange(params, "7d");
  const q = { search: sp(params, "search"), outcome: sp(params, "outcome"), resourceType: sp(params, "resourceType"), range: sp(params, "range"), page: sp(params, "page") ?? "1" };
  const result = await listAuditLogs(user, { ...q, from, to, page: Number(q.page) });
  return (
    <>
      <PageHeader title="Audit logs" description="Security-relevant actions: sign-ins, role changes, device credentials, exports, simulator control and more. Secrets are never recorded." />
      <Card>
        <FilterBar action="/audit-logs" search={q.search} searchPlaceholder="Search action, actor or resource ID…" selects={[
          { name: "range", label: "Period", value: q.range ?? "7d", options: RANGE_OPTIONS },
          { name: "outcome", label: "Outcome", value: q.outcome, options: [{ value: "SUCCESS", label: "Success" }, { value: "FAILURE", label: "Failure" }, { value: "DENIED", label: "Denied" }] },
          { name: "resourceType", label: "Resource", value: q.resourceType, options: ["auth", "user", "project", "device", "alert", "alertRule", "report", "simulation", "settings", "invitation"].map((v) => ({ value: v, label: v })) },
        ]} />
        <Table>
          <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Outcome</TableHead><TableHead className="hidden md:table-cell">Resource</TableHead><TableHead className="hidden lg:table-cell">IP</TableHead><TableHead className="hidden xl:table-cell">Details</TableHead></TableRow></TableHeader>
          <TableBody>
            {result.items.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(l.createdAt, user.timezone, { timeStyle: "medium" })}</TableCell>
                <TableCell>{l.actor?.name ?? <span className="text-muted-foreground">System / anonymous</span>}</TableCell>
                <TableCell className="font-mono text-xs">{l.action}</TableCell>
                <TableCell><Badge variant={l.outcome === "SUCCESS" ? "success" : l.outcome === "DENIED" ? "warning" : "danger"}>{l.outcome}</Badge></TableCell>
                <TableCell className="hidden md:table-cell"><span className="text-xs">{l.resourceType}</span>{l.resourceId && <div className="max-w-40 truncate font-mono text-[11px] text-muted-foreground">{l.resourceId}</div>}</TableCell>
                <TableCell className="hidden font-mono text-xs lg:table-cell">{l.ipAddress ?? "—"}</TableCell>
                <TableCell className="hidden max-w-80 xl:table-cell"><code className="line-clamp-2 text-[11px] break-all text-muted-foreground">{l.metadata ? JSON.stringify(l.metadata) : ""}</code></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {result.items.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No audit entries match.</p>}
        <Pagination page={result.page} totalPages={result.totalPages} total={result.total} basePath="/audit-logs" searchParams={q} />
      </Card>
    </>
  );
}
