import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/permissions/policies";
import type { ProjectConfiguration, WidgetTemplate } from "@/lib/project-types/types";
import { getMeasurement } from "@/lib/telemetry/measurements";
import { assertProjectAction } from "./access";
import { chooseBucket, latestReadingsForSensors, querySeries, type LatestReading, type Series } from "./telemetry-query";

export interface WidgetData {
  widget: WidgetTemplate;
  kind: "NUMERIC" | "STATE" | "EVENT";
  unit: string;
  latest: { sensorId: string; deviceName: string; name: string; sensorType: string; isSimulated: boolean; reading: LatestReading | null }[];
  series: Series[];
}

/**
 * Data for a project's template-driven monitoring widgets. Widgets reference sensor keys,
 * which are resolved against every active device in the project (one series per device).
 */
export async function projectWidgets(actor: Actor, projectId: string, from: Date, to: Date, deviceId?: string): Promise<WidgetData[]> {
  await assertProjectAction(actor, projectId, "telemetry.view");
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { configuration: true } });
  const config = project.configuration as unknown as ProjectConfiguration;
  const keys = [...new Set(config.widgets.flatMap((w) => w.sensorKeys))];
  const sensors = await prisma.sensor.findMany({
    where: { sensorKey: { in: keys }, isActive: true, device: { projectId, status: { not: "DISABLED" }, ...(deviceId ? { id: deviceId } : {}) } },
    select: { id: true, sensorKey: true, name: true, sensorType: true, unit: true, device: { select: { name: true, protocol: true } } },
    orderBy: [{ device: { name: "asc" } }],
    take: 200,
  });
  const charted = config.widgets.filter((w) => w.type === "line" || w.type === "bar").flatMap((w) => sensors.filter((s) => w.sensorKeys.includes(s.sensorKey)).map((s) => s.id));
  const bucket = chooseBucket(from, to, "auto");
  const [latest, seriesResult] = await Promise.all([
    latestReadingsForSensors(sensors.map((s) => s.id)),
    charted.length ? querySeries([...new Set(charted)], from, to, bucket, 500) : Promise.resolve({ series: [] as Series[] }),
  ]);
  const seriesById = new Map(seriesResult.series.map((s) => [s.sensorId, s]));

  return config.widgets.map((widget) => {
    const matched = sensors.filter((s) => widget.sensorKeys.includes(s.sensorKey));
    const def = getMeasurement(matched[0]?.sensorType ?? config.sensors.find((s) => s.key === widget.sensorKeys[0])?.measurement ?? "");
    return {
      widget,
      kind: def?.kind ?? "NUMERIC",
      unit: def?.canonicalUnit ?? "",
      latest: matched.map((s) => ({ sensorId: s.id, deviceName: s.device.name, name: s.name, sensorType: s.sensorType, isSimulated: s.device.protocol === "SIMULATED", reading: latest.get(s.id) ?? null })),
      series: matched.map((s) => seriesById.get(s.id)).filter((s): s is Series => Boolean(s)),
    };
  });
}
