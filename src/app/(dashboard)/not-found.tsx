import { EmptyState } from "@/components/layout/states";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return <EmptyState icon={SearchX} title="Not found" description="This resource doesn't exist, or you don't have access to it." action={<Button asChild variant="outline"><Link href="/dashboard">Back to dashboard</Link></Button>} />;
}
