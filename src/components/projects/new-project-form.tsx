"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check, ShieldAlert } from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS } from "@/lib/project-types/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/ui/alert-banner";

export interface TypeOption {
  key: string;
  name: string;
  category: keyof typeof CATEGORY_LABELS;
  description: string;
  isSensitive: boolean;
  analyticsLabel?: string;
  deviceRequirements: string[];
  safetyNotice?: string;
  sensorCount: number;
  widgetCount: number;
  ruleCount: number;
}

const schema = z
  .object({
    name: z.string().trim().min(3, "Name must be at least 3 characters").max(120),
    projectCode: z.string().trim().min(3, "Use at least 3 characters").max(20).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and hyphens only"),
    description: z.string().max(2000),
    projectTypeKey: z.string().min(1, "Choose a project type"),
    status: z.enum(["PLANNING", "ACTIVE", "PAUSED", "COMPLETED"]),
    startedAt: z.string(),
    endedAt: z.string(),
    applyTemplateRules: z.boolean(),
  })
  .refine((d) => !d.startedAt || !d.endedAt || d.endedAt >= d.startedAt, { path: ["endedAt"], message: "End date must be after the start date" });
type Values = z.infer<typeof schema>;

export function NewProjectForm({ types, initialType }: { types: TypeOption[]; initialType?: string }) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const { register, handleSubmit, watch, getValues, setValue, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", projectCode: "", description: "", projectTypeKey: initialType ?? "", status: "PLANNING", startedAt: "", endedAt: "", applyTemplateRules: true },
  });
  const typeKey = watch("projectTypeKey");
  const selected = types.find((t) => t.key === typeKey);
  const grouped = Object.entries(CATEGORY_LABELS).map(([cat, label]) => ({ label, items: types.filter((t) => t.category === cat) })).filter((g) => g.items.length);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const project = await apiFetch<{ id: string }>("/api/projects", {
        body: { ...values, startedAt: values.startedAt || undefined, endedAt: values.endedAt || undefined },
      });
      toast.success("Project created");
      router.push(`/projects/${project.id}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) setError("projectCode", { message: "This project code is already in use" });
      else setServerError(err instanceof Error ? err.message : "Could not create the project");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Project type</CardTitle>
            <CardDescription>The template provides sensors, dashboard widgets, alert rules and reports. You can tailor them after creation without affecting other projects.</CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset>
              <legend className="sr-only">Project type</legend>
              <div className="grid gap-5">
                {grouped.map((g) => (
                  <div key={g.label}>
                    <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {g.items.map((t) => (
                        <label key={t.key} className={cn("relative flex cursor-pointer flex-col rounded-lg border p-3 text-sm transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring", typeKey === t.key && "border-primary bg-primary/5")}>
                          <input type="radio" value={t.key} className="sr-only" {...register("projectTypeKey")} />
                          <span className="flex items-start justify-between gap-2 font-medium">
                            {t.name}
                            {typeKey === t.key && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                          </span>
                          <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description}</span>
                          {t.isSensitive && <Badge variant="warning" className="mt-2 w-fit">Health data · restricted</Badge>}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
            {errors.projectTypeKey && <p role="alert" className="mt-2 text-xs font-medium text-destructive">{errors.projectTypeKey.message}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>2. Details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="name" label="Project name" required error={errors.name?.message} className="sm:col-span-2">
              <Input {...register("name", { onBlur: (e) => { if (!getValues("projectCode") && e.target.value) setValue("projectCode", e.target.value.split(/\s+/).map((w: string) => w[0]).join("").toUpperCase().slice(0, 6) + "-" + new Date().getFullYear()); } })} />
            </Field>
            <Field id="projectCode" label="Project code" required error={errors.projectCode?.message} help="Unique. Stored in upper case.">
              <Input {...register("projectCode")} className="font-mono uppercase" />
            </Field>
            <Field id="status" label="Status" error={errors.status?.message}>
              <NativeSelect {...register("status")}>
                <option value="PLANNING">Planning</option>
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
                <option value="COMPLETED">Completed</option>
              </NativeSelect>
            </Field>
            <Field id="startedAt" label="Start date" error={errors.startedAt?.message}>
              <Input type="date" {...register("startedAt")} />
            </Field>
            <Field id="endedAt" label="End date" error={errors.endedAt?.message}>
              <Input type="date" {...register("endedAt")} />
            </Field>
            <Field id="description" label="Description" error={errors.description?.message} className="sm:col-span-2">
              <Textarea rows={3} {...register("description")} />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("applyTemplateRules")} />
              Create the template&apos;s default alert rules
            </label>
          </CardContent>
        </Card>
        {serverError && <AlertBanner variant="danger" role="alert">{serverError}</AlertBanner>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create project"}</Button>
        </div>
      </div>

      <aside className="xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Template preview</CardTitle>
            <CardDescription>{selected ? CATEGORY_LABELS[selected.category] : "Choose a project type to see what it includes."}</CardDescription>
          </CardHeader>
          {selected && (
            <CardContent className="grid gap-4 text-sm">
              <p className="font-medium">{selected.name}</p>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[["Sensors", selected.sensorCount], ["Widgets", selected.widgetCount], ["Alert rules", selected.ruleCount]].map(([l, v]) => (
                  <div key={l} className="rounded-md bg-muted p-2"><dt className="text-xs text-muted-foreground">{l}</dt><dd className="text-lg font-semibold">{v}</dd></div>
                ))}
              </dl>
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Device requirements</p>
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">{selected.deviceRequirements.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
              {selected.analyticsLabel && <p className="text-xs text-muted-foreground">Analytics: <strong>{selected.analyticsLabel}</strong></p>}
              {selected.safetyNotice && (
                <AlertBanner variant="warning"><ShieldAlert className="size-4 shrink-0" /> <span>{selected.safetyNotice}</span></AlertBanner>
              )}
            </CardContent>
          )}
        </Card>
      </aside>
    </form>
  );
}
