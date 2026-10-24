import Link from "next/link";
import { cn } from "@/lib/utils";

export const PROJECT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "monitoring", label: "Monitoring" },
  { key: "devices", label: "Devices" },
  { key: "sensors", label: "Sensors" },
  { key: "alerts", label: "Alerts" },
  { key: "reports", label: "Reports" },
  { key: "members", label: "Members" },
  { key: "simulation", label: "Simulation" },
] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number]["key"];

export function ProjectTabs({ projectId, active, hide = [] }: { projectId: string; active: ProjectTab; hide?: ProjectTab[] }) {
  return (
    <nav aria-label="Project sections" className="no-print -mx-4 mb-5 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {PROJECT_TABS.filter((t) => !hide.includes(t.key)).map((t) => (
          <li key={t.key}>
            <Link
              href={t.key === "overview" ? `/projects/${projectId}` : `/projects/${projectId}?tab=${t.key}`}
              aria-current={active === t.key ? "page" : undefined}
              className={cn("inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground", active === t.key ? "border-primary text-foreground" : "border-transparent")}
            >
              {t.label}
            </Link>
          </li>
        ))}
        <li>
          <Link href={`/projects/${projectId}/settings`} className="inline-flex h-10 items-center border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground hover:text-foreground">Settings</Link>
        </li>
      </ul>
    </nav>
  );
}
