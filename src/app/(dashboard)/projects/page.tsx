import Link from "next/link";
import { FolderOpen, Plus } from "lucide-react";
import { requirePageUser } from "@/lib/auth/session";
import { canGlobal } from "@/lib/permissions/policies";
import { CATEGORY_LABELS } from "@/lib/project-types/types";
import { sp } from "@/lib/format";
import { listProjects } from "@/server/services/projects";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterBar } from "@/components/forms/filter-bar";
import { Pagination } from "@/components/dashboard/pagination";
import { ProjectCard } from "@/components/projects/project-card";
import { EmptyState } from "@/components/layout/states";
import { NativeSelect } from "@/components/ui/input";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const user = await requirePageUser();
  const params = await searchParams;
  const q = {
    search: sp(params, "search"),
    status: sp(params, "status"),
    category: sp(params, "category"),
    includeArchived: sp(params, "includeArchived"),
    sort: sp(params, "sort") ?? "updatedAt",
    order: sp(params, "order") ?? (sp(params, "sort") === "name" ? "asc" : "desc"),
    page: sp(params, "page") ?? "1",
  };
  const result = await listProjects(user, q as never);
  const canCreate = canGlobal(user, "project.create");

  return (
    <>
      <PageHeader title="Projects" description="Every IoT deployment you can access. Each project uses a project-type template that you can tailor independently." actions={canCreate && <Button asChild><Link href="/projects/new"><Plus /> New project</Link></Button>} />
      <Card className="mb-4">
        <FilterBar
          action="/projects"
          search={q.search}
          searchPlaceholder="Search name, code or description…"
          selects={[
            { name: "status", label: "Status", value: q.status, options: ["PLANNING", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })) },
            { name: "category", label: "Category", value: q.category, options: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })) },
          ]}
          extra={
            <label className="sm:w-44">
              <span className="sr-only">Sort</span>
              <NativeSelect name="sort" defaultValue={q.sort} aria-label="Sort by">
                <option value="updatedAt">Recently updated</option>
                <option value="createdAt">Newest</option>
                <option value="name">Name</option>
                <option value="projectCode">Code</option>
              </NativeSelect>
            </label>
          }
        />
      </Card>
      {result.items.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No projects match" description={q.search || q.status || q.category ? "Try different filters." : "No projects yet."} action={canCreate ? <Button asChild><Link href="/projects/new"><Plus /> New project</Link></Button> : undefined} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {result.items.map((p) => <div key={p.id} className="relative"><ProjectCard p={p} /></div>)}
          </div>
          <Card className="mt-4"><Pagination page={result.page} totalPages={result.totalPages} total={result.total} basePath="/projects" searchParams={q} /></Card>
        </>
      )}
    </>
  );
}
