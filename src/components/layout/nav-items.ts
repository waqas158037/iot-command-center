import type { UserRole } from "@prisma/client";

export interface NavItem {
  href: string;
  label: string;
  icon: "dashboard" | "projects" | "devices" | "monitoring" | "sensors" | "alerts" | "reports" | "team" | "audit" | "settings";
  roles?: UserRole[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/projects", label: "Projects", icon: "projects" },
  { href: "/devices", label: "Devices", icon: "devices" },
  { href: "/monitoring", label: "Live Monitoring", icon: "monitoring" },
  { href: "/sensors", label: "Sensors", icon: "sensors" },
  { href: "/alerts", label: "Alerts", icon: "alerts" },
  { href: "/reports", label: "Reports", icon: "reports" },
  { href: "/team", label: "Team", icon: "team", roles: ["SUPER_ADMIN", "PROJECT_MANAGER"] },
  { href: "/audit-logs", label: "Audit Logs", icon: "audit", roles: ["SUPER_ADMIN"] },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function navItemsForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  devices: "Devices",
  monitoring: "Live Monitoring",
  sensors: "Sensors",
  alerts: "Alerts",
  "alert-rules": "Alert Rules",
  reports: "Reports",
  telemetry: "Telemetry",
  team: "Team",
  "audit-logs": "Audit Logs",
  settings: "Settings",
  profile: "Profile",
  notifications: "Notifications",
  integrations: "Integrations",
  new: "New",
  simulator: "Simulator",
};

export function segmentLabel(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  if (/^[0-9a-f-]{36}$/i.test(segment)) return "Details";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}
