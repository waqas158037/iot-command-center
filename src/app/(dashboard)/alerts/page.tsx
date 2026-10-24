import { BellRing } from "lucide-react";
import { requirePageUser } from "@/lib/auth/session";
import { sp } from "@/lib/format";
import { listAlerts } from "@/server/services/alerts";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/forms/filter-bar";
import { Pagination } from "@/components/dashboard/pagination";
import { AlertTable } from "@/components/alerts/alert-table";
import { EmptyState } from "@/components/layout/states";
import { LiveIndicator, LiveProvider } from "@/components/telemetry/realtime";
import Link from "next/link";
import { orNotFound, projectOptions } from "../shared";

export const metadata = { title: "Alerts" };

export default async function AlertsPage({ searchParams }: PageProps<"/alerts">) {
  const user = await requirePageUser();
  const params = await searchParams;
  const q = { search: sp(params, "search"), projectId: sp(params, "projectId"), severity: sp(params, "severity"), status: sp(params, "status"), page: sp(params, "page") ?? "1" };
  const [result, projects] = await Promise.all([orNotFound(listAlerts(user, q)), projectOptions(user)]);
  return (
    <LiveProvider projectId={q.projectId}>
      <PageHeader title="Alerts" description="Alerts are raised by rules on stored telemetry and device status. Repeated violations increase the occurrence count instead of creating duplicates." actions={<><LiveIndicator /><Button asChild variant="outline"><Link href="/alert-rules">Alert rules</Link></Button></>} />
      <Card>
        <FilterBar
          action="/alerts"
          search={q.search}
          searchPlaceholder="Search alert title…"
          selects={[
            { name: "projectId", label: "Project", value: q.projectId, options: projects },
            { name: "severity", label: "Severity", value: q.severity, options: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })) },
            { name: "status", label: "Status", value: q.status, options: [{ value: "ACTIVE", label: "Active" }, { value: "ACKNOWLEDGED", label: "Acknowledged" }, { value: "RESOLVED", label: "Resolved" }] },
          ]}
        />
        {result.items.length === 0 ? <EmptyState icon={BellRing} className="border-0" title="No alerts" description="Nothing matches these filters." /> : <AlertTable alerts={result.items} />}
        <Pagination page={result.page} totalPages={result.totalPages} total={result.total} basePath="/alerts" searchParams={q} />
      </Card>
    </LiveProvider>
  );
}
