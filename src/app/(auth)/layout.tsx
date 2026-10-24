import { Radio } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,520px)]">
      <div className="relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary/15 text-sidebar-primary"><Radio className="size-5" /></span>
          <span className="text-base font-semibold text-white">IoT Command Center</span>
        </div>
        <div className="max-w-lg">
          <h2 className="text-3xl font-semibold text-white">One console for every IoT project.</h2>
          <p className="mt-3 text-sm leading-relaxed text-sidebar-muted">
            Manage projects, devices and sensors across energy, agriculture, environment, healthcare, livestock and security deployments, with live telemetry, alert rules and audit trails.
          </p>
        </div>
        <p className="text-xs text-sidebar-muted">Simulated data is always labelled. Health-related projects are academic demonstrations, not medical devices.</p>
      </div>
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
