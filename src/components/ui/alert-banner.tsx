import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const bannerVariants = cva("flex gap-3 rounded-lg border p-3 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0", {
  variants: {
    variant: {
      info: "border-info/30 bg-info/6 text-foreground [&_svg]:text-info",
      warning: "border-warning/40 bg-warning/10 text-foreground [&_svg]:text-[oklch(0.55_0.13_65)]",
      danger: "border-destructive/30 bg-destructive/6 text-foreground [&_svg]:text-destructive",
      success: "border-success/30 bg-success/8 text-foreground [&_svg]:text-success",
    },
  },
  defaultVariants: { variant: "info" },
});

export function AlertBanner({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof bannerVariants>) {
  return <div role="note" className={cn(bannerVariants({ variant }), className)} {...props} />;
}
