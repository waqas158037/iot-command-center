"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/ui/input";

export interface FilterOption { value: string; label: string }

/** URL-driven filter row; every change updates the query string so views are shareable. */
export function UrlFilters({ filters }: { filters: { name: string; label: string; options: FilterOption[]; allLabel?: string; resets?: string[]; fallback?: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const update = (name: string, value: string, resets: string[] = []) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    for (const r of resets) next.delete(r);
    next.delete("page");
    if (name === "range") {
      next.delete("from");
      next.delete("to");
    }
    router.push(`${pathname}?${next.toString()}`);
  };
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <label key={f.name} className="min-w-0">
          <span className="sr-only">{f.label}</span>
          <NativeSelect aria-label={f.label} value={params.get(f.name) ?? f.fallback ?? ""} onChange={(e) => update(f.name, e.target.value, f.resets)} className="h-8 w-auto max-w-[14rem] text-xs">
            {f.allLabel !== undefined && <option value="">{f.allLabel}</option>}
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NativeSelect>
        </label>
      ))}
    </div>
  );
}
