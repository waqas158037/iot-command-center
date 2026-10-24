import * as React from "react";
import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function KpiCard({ label, value, hint, icon: Icon, tone = "default", footer }: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  footer?: React.ReactNode;
}) {
  const toneClass = {
    default: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/18 text-[oklch(0.55_0.13_65)]",
    danger: "bg-destructive/10 text-destructive",
    info: "bg-info/12 text-info",
  }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            {label}
            {hint && (
              <Tooltip content={hint}>
                <button type="button" aria-label={`About ${label}`} className="rounded text-muted-foreground/70 hover:text-foreground"><Info className="size-3" /></button>
              </Tooltip>
            )}
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
        {Icon && <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", toneClass)}><Icon className="size-4" /></span>}
      </div>
      {footer && <div className="mt-2 text-xs text-muted-foreground">{footer}</div>}
    </Card>
  );
}
