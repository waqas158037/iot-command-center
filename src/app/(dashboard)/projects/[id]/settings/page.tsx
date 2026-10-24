import { requirePageUser } from "@/lib/auth/session";
import { canOnProject } from "@/lib/permissions/policies";
import { getProject } from "@/server/services/projects";
import { getProjectAccess } from "@/server/services/access";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { ProjectSettingsForm } from "@/components/projects/project-settings-form";
import { orNotFound } from "../../../shared";

export const metadata = { title: "Project settings" };

export default async function ProjectSettingsPage({ params }: PageProps<"/projects/[id]/settings">) {
  const user = await requirePageUser();
  const { id } = await params;
  const project = await orNotFound(getProject(user, id));
  const access = await getProjectAccess(user, id);
  return (
    <>
      <PageHeader title={`${project.name} · Settings`} description={<span className="font-mono">{project.projectCode}</span>} />
      <ProjectTabs projectId={id} active={"settings" as never} />
      <ProjectSettingsForm
        project={{ id, name: project.name, description: project.description, status: project.status, startedAt: project.startedAt?.toISOString() ?? null, endedAt: project.endedAt?.toISOString() ?? null, settings: project.configuration.settings, archived: project.archivedAt !== null }}
        fields={project.template?.configSchema ?? []}
        canUpdate={project.access.canUpdate}
        canArchive={canOnProject(user, "project.archive", access)}
      />
    </>
  );
}
