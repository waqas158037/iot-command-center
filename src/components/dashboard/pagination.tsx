import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Pagination({ page, totalPages, total, basePath, searchParams }: { page: number; totalPages: number; total: number; basePath: string; searchParams: Record<string, string | undefined> }) {
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v && k !== "page") sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t px-3 py-3 text-sm">
      <span className="text-muted-foreground">{total} result{total === 1 ? "" : "s"} · page {page} of {totalPages}</span>
      <span className="flex gap-2">
        <Link aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} href={href(Math.max(1, page - 1))} className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}>
          <ChevronLeft /> Previous
        </Link>
        <Link aria-disabled={page >= totalPages} tabIndex={page >= totalPages ? -1 : undefined} href={href(Math.min(totalPages, page + 1))} className={cn(buttonVariants({ variant: "outline", size: "sm" }), page >= totalPages && "pointer-events-none opacity-50")}>
          Next <ChevronRight />
        </Link>
      </span>
    </nav>
  );
}
