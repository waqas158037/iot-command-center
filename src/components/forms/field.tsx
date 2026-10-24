import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label + control + accessible error/help text. */
export function Field({ id, label, error, help, children, className, required }: { id: string; label: string; error?: string; help?: React.ReactNode; children: React.ReactElement<Record<string, unknown>>; className?: string; required?: boolean }) {
  const describedBy = [error ? `${id}-error` : null, help ? `${id}-help` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive" aria-hidden> *</span>}
      </Label>
      {React.cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, required })}
      {help && !error && <p id={`${id}-help`} className="text-xs text-muted-foreground">{help}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
