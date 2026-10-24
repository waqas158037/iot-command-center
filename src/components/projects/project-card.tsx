import Link from "next/link";
import { Bell, Cpu, Users } from "lucide-react";
import type { ProjectCategory, ProjectStatus } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProjectStatusBadge } from "@/components/dashboard/status-badges";
import { CATEGORY_LABELS } from "@/lib/project-types/types";

export function ProjectCard({ p }: {
  p: { id: string; name: string; projectCode: string; description: string; status: ProjectStatus; projectType: { name: string; category: ProjectCategory; isSensitive: boolean }; _count: { devices: number; members: number }; onlineDevices: number; openAlerts: number };
}) {
  return (
    <Card className="group flex flex-col p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">{p.projectCode}</span>
        <ProjectStatusBadge status={p.status} />
      </div>
      <Link href={`/projects/${p.id}`} className="mt-1 line-clamp-2 font-semibold leading-snug after:absolute after:inset-0 group-hover:text-primary [position:static]">
        {p.name}
      </Link>
      <p className="mt-1 text-xs text-muted-foreground">{CATEGORY_LABELS[p.projectType.category]}</p>
      <p className="mt-2 line-clamp-2 flex-1 text-sm text-muted-foreground">{p.description || p.projectType.name}</p>
      <div className="mt-4 flex items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1" title="Online / total devices"><Cpu className="size-3.5" />{p.onlineDevices}/{p._count.devices}</span>
        <span className={`flex items-center gap-1 ${p.openAlerts ? "font-medium text-destructive" : ""}`} title="Open alerts"><Bell className="size-3.5" />{p.openAlerts}</span>
        <span className="flex items-center gap-1" title="Members"><Users className="size-3.5" />{p._count.members}</span>
        {p.projectType.isSensitive && <Badge variant="warning" className="ml-auto">Health data</Badge>}
      </div>
    </Card>
  );
}
