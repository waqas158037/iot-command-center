import * as React from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";

export interface FilterSelect {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  value?: string;
}

/** Server-rendered GET filter form: works without JavaScript and keeps filters in the URL. */
export function FilterBar({ action, search, selects = [], extra, searchPlaceholder = "Search…" }: { action: string; search?: string; selects?: FilterSelect[]; extra?: React.ReactNode; searchPlaceholder?: string }) {
  return (
    <form action={action} method="get" className="no-print flex flex-col gap-2 border-b p-3 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="relative min-w-0 flex-1 sm:min-w-56">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="search" defaultValue={search} placeholder={searchPlaceholder} className="pl-8" />
      </label>
      {selects.map((s) => (
        <label key={s.name} className="flex flex-col gap-1 sm:w-44">
          <span className="sr-only">{s.label}</span>
          <NativeSelect name={s.name} defaultValue={s.value ?? ""} aria-label={s.label}>
            <option value="">{s.label}: all</option>
            {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NativeSelect>
        </label>
      ))}
      {extra}
      <Button type="submit" variant="secondary">Apply</Button>
    </form>
  );
}
