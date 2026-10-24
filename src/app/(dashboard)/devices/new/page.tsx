import { requirePageUser } from "@/lib/auth/session";
import { env, simulatorAllowed } from "@/lib/env";
import { canOnProject } from "@/lib/permissions/policies";
import { sp } from "@/lib/format";
import { prisma } from "@/lib/db";
import { accessibleProjectIds } from "@/server/services/access";
import { PageHeader } from "@/components/layout/page-header";
import { UnauthorizedState } from "@/components/layout/states";
import { DeviceCreateForm } from "@/components/devices/device-form";

export const metadata = { title: "Register device" };

export default async function NewDevicePage({ searchParams }: PageProps<"/devices/new">) {
  const user = await requirePageUser();
  const ids = await accessibleProjectIds(user);
  const projects = await prisma.project.findMany({
    where: { ...(ids ? { id: { in: ids } } : {}), archivedAt: null },
    select: { id: true, name: true, projectCode: true, projectType: { select: { isSensitive: true } }, members: { where: { userId: user.id }, select: { projectRole: true } } },
    orderBy: { name: "asc" },
  });
  const allowed = projects
    .filter((p) => canOnProject(user, "device.create", { membershipRole: p.members[0]?.projectRole ?? null, isSensitive: p.projectType.isSensitive }))
    .map((p) => ({ value: p.id, label: `${p.name} (${p.projectCode})` }));
  if (allowed.length === 0) return <UnauthorizedState message="You need the project manager role on at least one project to register devices." />;
  const e = env();
  const requested = sp(await searchParams, "projectId");
  return (
    <>
      <PageHeader title="Register device" description="Each device gets a unique identifier and a secret credential. The secret is shown once." />
      <DeviceCreateForm projects={allowed} initialProjectId={allowed.some((p) => p.value === requested) ? requested : undefined} appUrl={e.APP_URL} topicPrefix={e.MQTT_TOPIC_PREFIX} simulatorEnabled={simulatorAllowed()} />
    </>
  );
}
