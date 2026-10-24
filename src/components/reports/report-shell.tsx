import Link from "next/link";
import { Download } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { RANGE_OPTIONS } from "@/lib/format";
import { UrlFilters, type FilterOption } from "@/components/dashboard/dashboard-filters";
import { PrintButton } from "./print-button";

export const REPORT_NAV = [
  { href: "/reports", label: "Summary" },
  { href: "/reports/telemetry", label: "Telemetry" },
  { href: "/reports/devices", label: "Devices" },
  { href: "/reports/alerts", label: "Alerts" },
];

/** Shared report chrome: section nav, filters, export links, print, and the generation stamp. */
export function ReportShell({ active, projects, extraFilters = [], exports = [], query, from, to, timeZone, children }: {
  active: string;
  projects: FilterOption[];
  extraFilters?: { name: string; label: string; options: FilterOption[]; allLabel?: string; fallback?: string }[];
  exports?: { report: string; label: string; group?: string }[];
  query: Record<string, string | undefined>;
  from: Date;
  to: Date;
  timeZone: string;
  children: React.ReactNode;
}) {
  const exportHref = (report: string, group?: string) => {
    const p = new URLSearchParams({ report, from: from.toISOString(), to: to.toISOString() });
    for (const k of ["projectId", "deviceId", "sensorType"]) if (query[k]) p.set(k, query[k]!);
    if (group) p.set("group", group);
    return `/api/reports/export?${p.toString()}`;
  };
  return (
    <div className="grid gap-5">
      <nav aria-label="Reports" className="no-print -mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1">
          {REPORT_NAV.map((n) => (
            <li key={n.href}><Link href={`${n.href}${query.projectId ? `?projectId=${query.projectId}` : ""}`} aria-current={active === n.href ? "page" : undefined} className={cn("inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium text-muted-foreground hover:text-foreground", active === n.href ? "border-primary text-foreground" : "border-transparent")}>{n.label}</Link></li>
          ))}
        </ul>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <UrlFilters filters={[{ name: "range", label: "Date range", options: RANGE_OPTIONS.filter((o) => o.value !== "1h"), fallback: "7d" }, { name: "projectId", label: "Project", allLabel: "All my projects", options: projects }, ...extraFilters]} />
        <div className="no-print flex flex-wrap gap-2">
          {exports.map((e) => <a key={e.report + (e.group ?? "")} href={exportHref(e.report, e.group)} className={buttonVariants({ variant: "outline", size: "sm" })} download><Download /> {e.label}</a>)}
          <PrintButton />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Period {formatDateTime(from, timeZone)} – {formatDateTime(to, timeZone)} ({timeZone}). Generated {formatDateTime(new Date(), timeZone)}. Simulated data is labelled and included unless filtered out. CSV exports include only projects where your role permits export.
      </p>
      {children}
    </div>
  );
}
