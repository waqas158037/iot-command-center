"use client";

import { ErrorState } from "@/components/layout/states";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState description={`The page could not be loaded. ${error.digest ? `Reference: ${error.digest}` : ""}`} retry={reset} />;
}
