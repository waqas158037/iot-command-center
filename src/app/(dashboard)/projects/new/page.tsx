import { requirePageUser } from "@/lib/auth/session";
import { canGlobal } from "@/lib/permissions/policies";
import { sp } from "@/lib/format";
import { listProjectTypes } from "@/server/services/project-types";
import { PageHeader } from "@/components/layout/page-header";
import { UnauthorizedState } from "@/components/layout/states";
import { NewProjectForm, type TypeOption } from "@/components/projects/new-project-form";

export const metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: PageProps<"/projects/new">) {
  const user = await requirePageUser();
  if (!canGlobal(user, "project.create")) return <UnauthorizedState message="Only super admins and project managers can create projects." />;
  const types = await listProjectTypes();
  const options: TypeOption[] = types.map((t) => ({
    key: t.key,
    name: t.name,
    category: t.category,
    description: t.description,
    isSensitive: t.isSensitive,
    analyticsLabel: t.analyticsLabel,
    deviceRequirements: t.deviceRequirements,
    safetyNotice: t.safetyNotice,
    sensorCount: t.defaultConfiguration.sensors.length,
    widgetCount: t.defaultConfiguration.widgets.length,
    ruleCount: t.defaultConfiguration.alertRules.length,
  }));
  return (
    <>
      <PageHeader title="New project" description="Create a project from one of the 16 project-type templates." />
      <NewProjectForm types={options} initialType={sp(await searchParams, "type")} />
    </>
  );
}
