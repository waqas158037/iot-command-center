import Link from "next/link";
import { Cpu, Plus } from "lucide-react";
import { requirePageUser } from "@/lib/auth/session";
import { canGlobal } from "@/lib/permissions/policies";
import { sp } from "@/lib/format";
import { listDevices } from "@/server/services/devices";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterBar } from "@/components/forms/filter-bar";
import { Pagination } from "@/components/dashboard/pagination";
import { DeviceTable } from "@/components/devices/device-table";
import { EmptyState } from "@/components/layout/states";
import { LiveProvider, LiveIndicator } from "@/components/telemetry/realtime";
import { orNotFound, projectOptions } from "../shared";

export const metadata = { title: "Devices" };

export default async function DevicesPage({ searchParams }: PageProps<"/devices">) {
  const user = await requirePageUser();
  const params = await searchParams;
  const q = { search: sp(params, "search"), projectId: sp(params, "projectId"), status: sp(params, "status"), protocol: sp(params, "protocol"), page: sp(params, "page") ?? "1" };
  const [result, projects] = await Promise.all([orNotFound(listDevices(user, q)), projectOptions(user)]);
  const canCreate = canGlobal(user, "project.create");
  return (
    <LiveProvider projectId={q.projectId}>
      <PageHeader title="Devices" description="Status is derived from the last heartbeat or reading. New devices are Unknown until they report." actions={<><LiveIndicator />{canCreate && <Button asChild><Link href="/devices/new"><Plus /> Register device</Link></Button>}</>} />
      <Card>
        <FilterBar
          action="/devices"
          search={q.search}
          searchPlaceholder="Search name, identifier or location…"
          selects={[
            { name: "projectId", label: "Project", value: q.projectId, options: projects },
            { name: "status", label: "Status", value: q.status, options: ["ONLINE", "DEGRADED", "OFFLINE", "UNKNOWN", "DISABLED"].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })) },
            { name: "protocol", label: "Protocol", value: q.protocol, options: [{ value: "MQTT", label: "MQTT" }, { value: "HTTP", label: "HTTP" }, { value: "SIMULATED", label: "Simulated" }] },
          ]}
        />
        {result.items.length === 0 ? <EmptyState icon={Cpu} className="border-0" title="No devices found" description="Adjust the filters or register a device." /> : <DeviceTable devices={result.items} />}
        <Pagination page={result.page} totalPages={result.totalPages} total={result.total} basePath="/devices" searchParams={q} />
      </Card>
    </LiveProvider>
  );
}
