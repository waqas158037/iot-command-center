import Link from "next/link";
import type { AlertConditionType } from "@prisma/client";
import { requirePageUser } from "@/lib/auth/session";
import { formatDateTime, formatRelative, titleCase } from "@/lib/format";
import { formatMeasurementValue } from "@/lib/telemetry/measurements";
import { describeCondition, type Threshold } from "@/lib/telemetry/alert-logic";
import { getAlert } from "@/server/services/alerts";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertStatusBadge, SeverityBadge, SimulatedBadge } from "@/components/dashboard/status-badges";
import { AlertBanner } from "@/components/ui/alert-banner";
import { AlertActions } from "@/components/alerts/alert-actions";
import { orNotFound } from "../../shared";

export const metadata = { title: "Alert" };

export default async function AlertPage({ params }: PageProps<"/alerts/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;
  const alert = await orNotFound(getAlert(user, id));
  const tz = user.timezone;
  const val = (v: { toNumber(): number } | null) => (v && alert.sensor ? formatMeasurementValue(alert.sensor.sensorType, v.toNumber()) : "—");
  const snapshot = alert.thresholdSnapshot as { conditionType?: AlertConditionType; threshold?: Threshold; unit?: string } | null;

  return (
    <>
      <PageHeader title={alert.title} badges={<><SeverityBadge severity={alert.severity} /><AlertStatusBadge status={alert.status} />{alert.isSimulated && <SimulatedBadge />}</>}
        description={<><Link className="hover:underline" href={`/projects/${alert.project.id}`}>{alert.project.name}</Link>{alert.device && <> · <Link className="hover:underline" href={`/devices/${alert.device.id}`}>{alert.device.name}</Link></>}{alert.sensor && ` · ${alert.sensor.name}`}</>} />
      {alert.isSimulated && <AlertBanner className="mb-4">Raised from simulated data. It does not describe a real-world event.</AlertBanner>}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="grid gap-5 xl:col-span-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              {alert.description && <p className="text-sm">{alert.description}</p>}
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-muted-foreground">Triggering value</dt><dd className="font-medium tabular-nums">{val(alert.triggeringValue)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Latest value</dt><dd className="tabular-nums">{val(alert.lastValue)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Occurrences</dt><dd className="tabular-nums">{alert.occurrenceCount}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Raised</dt><dd>{formatDateTime(alert.createdAt, tz)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Last triggered</dt><dd>{formatRelative(alert.lastTriggeredAt)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Rule</dt><dd>{alert.rule ? <Link className="hover:underline" href={`/alert-rules?projectId=${alert.project.id}`}>{alert.rule.name}</Link> : "—"}</dd></div>
                {snapshot?.conditionType && snapshot.threshold && <div className="col-span-2 sm:col-span-3"><dt className="text-xs text-muted-foreground">Condition when raised</dt><dd>{describeCondition(snapshot.conditionType, snapshot.threshold, snapshot.unit ?? alert.sensor?.unit)}</dd></div>}
                {alert.acknowledgedAt && <div><dt className="text-xs text-muted-foreground">Acknowledged</dt><dd>{formatDateTime(alert.acknowledgedAt, tz)}{alert.acknowledgedBy && ` by ${alert.acknowledgedBy.name}`}</dd></div>}
                {alert.resolvedAt && <div><dt className="text-xs text-muted-foreground">Resolved</dt><dd>{formatDateTime(alert.resolvedAt, tz)}{alert.resolvedBy ? ` by ${alert.resolvedBy.name}` : " automatically"}</dd></div>}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative grid gap-4 border-l pl-4 text-sm">
                {alert.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-primary" aria-hidden />
                    <p className="font-medium">{titleCase(e.eventType)}{e.actor && <span className="font-normal text-muted-foreground"> · {e.actor.name}</span>}</p>
                    {e.notes && <p className="mt-1 rounded-md bg-muted p-2 whitespace-pre-wrap">{e.notes}</p>}
                    <p className="text-xs text-muted-foreground">{formatDateTime(e.createdAt, tz)}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader className="pb-2"><CardTitle className="text-base">Actions</CardTitle></CardHeader>
          <CardContent><AlertActions alertId={id} status={alert.status} {...alert.access} /></CardContent>
        </Card>
      </div>
    </>
  );
}
