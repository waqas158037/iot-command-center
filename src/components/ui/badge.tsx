import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        success: "border-transparent bg-success/12 text-[oklch(0.45_0.12_155)]",
        warning: "border-transparent bg-warning/18 text-[oklch(0.48_0.12_65)]",
        danger: "border-transparent bg-destructive/12 text-destructive",
        info: "border-transparent bg-info/12 text-[oklch(0.45_0.12_240)]",
        muted: "border-transparent bg-muted text-muted-foreground",
        simulated: "border-dashed border-[oklch(0.6_0.15_300)] bg-[oklch(0.6_0.15_300)]/8 text-[oklch(0.45_0.15_300)] uppercase tracking-wide",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
