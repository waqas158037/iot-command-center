import { requirePageUser } from "@/lib/auth/session";
import { sp } from "@/lib/format";
import { prisma } from "@/lib/db";
import { getMeasurement } from "@/lib/telemetry/measurements";
import { describeCondition, type Threshold } from "@/lib/telemetry/alert-logic";
import type { ProjectConfiguration } from "@/lib/project-types/types";
import { getProject } from "@/server/services/projects";
import { listAlertRules } from "@/server/services/alerts";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { UrlFilters } from "@/components/dashboard/dashboard-filters";
import { EmptyState } from "@/components/layout/states";
import { RuleManager } from "@/components/alerts/rule-manager";
import { orNotFound, projectOptions } from "../shared";

export const metadata = { title: "Alert rules" };

export default async function AlertRulesPage({ searchParams }: PageProps<"/alert-rules">) {
  const user = await requirePageUser();
  const projects = await projectOptions(user);
  const requested = sp(await searchParams, "projectId");
  const projectId = projects.some((p) => p.value === requested) ? requested! : projects[0]?.value;
  if (!projectId) return <EmptyState title="No projects" description="You need access to a project to manage alert rules." />;
  const [project, rules, devices] = await Promise.all([
    orNotFound(getProject(user, projectId)),
    listAlertRules(user, { projectId, pageSize: 100 }),
    prisma.device.findMany({ where: { projectId, status: { not: "DISABLED" } }, orderBy: { name: "asc" }, take: 200, select: { id: true, name: true, sensors: { select: { id: true, name: true, sensorType: true }, orderBy: { name: "asc" } } } }),
  ]);
  const config = project.configuration as ProjectConfiguration;
  const types = [...new Set([...config.sensors.map((s) => s.measurement), ...devices.flatMap((d) => d.sensors.map((s) => s.sensorType))])];
  return (
    <>
      <PageHeader title="Alert rules" description="Rules are evaluated on every accepted reading (and by the worker for offline and missing-data checks). Late or out-of-order readings never trigger alerts." />
      <div className="mb-4"><UrlFilters filters={[{ name: "projectId", label: "Project", options: projects, fallback: projectId }]} /></div>
      <Card>
        <CardContent className="pt-6">
          <RuleManager
            projectId={projectId}
            canManage={project.access.canManageRules}
            devices={devices}
            measurements={types.map((k) => ({ key: k, label: getMeasurement(k)?.label ?? k, unit: getMeasurement(k)?.canonicalUnit ?? "" }))}
            rules={rules.items.map((r) => ({
              id: r.id, name: r.name, description: r.description, conditionType: r.conditionType, severity: r.severity, isEnabled: r.isEnabled,
              sensorType: r.sensorType, deviceId: r.deviceId, sensorId: r.sensorId, threshold: r.thresholdConfiguration as Record<string, number>,
              consecutiveCount: r.consecutiveCount, cooldownSeconds: r.cooldownSeconds, autoResolve: r.autoResolve, alertCount: r._count.alerts,
              summary: describeCondition(r.conditionType, r.thresholdConfiguration as Threshold, r.sensorType ? getMeasurement(r.sensorType)?.canonicalUnit : ""),
              target: [r.device?.name ?? "All devices", r.sensor?.name ?? (r.sensorType ? getMeasurement(r.sensorType)?.label : null)].filter(Boolean).join(" · "),
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
