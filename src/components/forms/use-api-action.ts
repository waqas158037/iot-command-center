"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";

/** Runs an API mutation, shows a toast, and refreshes server components on success. */
export function useApiAction() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    async <T,>(path: string, init: { method?: string; body?: unknown }, success?: string): Promise<T | undefined> => {
      setPending(true);
      try {
        const result = await apiFetch<T>(path, init);
        if (success) toast.success(success);
        router.refresh();
        return result;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Request failed");
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [router],
  );
  return { run, pending };
}
