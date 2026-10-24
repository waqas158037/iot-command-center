import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Inbox, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function EmptyState({ title, description, action, icon: Icon = Inbox, className }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-12 text-center", className)}>
      <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted"><Icon className="size-5 text-muted-foreground" /></span>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, retry }: { title?: string; description?: string; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
      <AlertTriangle className="mb-3 size-6 text-destructive" />
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {retry && <Button variant="outline" size="sm" className="mt-4" onClick={retry}>Try again</Button>}
    </div>
  );
}

export function UnauthorizedState({ message = "You don't have access to this page." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card px-6 py-16 text-center">
      <Lock className="mb-3 size-6 text-muted-foreground" />
      <h2 className="text-base font-semibold">Access restricted</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      <Button asChild variant="outline" size="sm" className="mt-4"><Link href="/dashboard">Back to dashboard</Link></Button>
    </div>
  );
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-96 max-w-full" /></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-56" />)}
    </div>
  );
}
