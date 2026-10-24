import { apiRoute, parseQuery } from "@/lib/http/handler";
import { MEASUREMENT_GROUPS, reportFilterSchema, resolveReportScope, sensorStatistics } from "@/server/services/reports";

/** Sensor statistics; ?group=environmental|agricultural|health narrows to a measurement family. */
export const GET = apiRoute(async ({ req, user }) => {
  const scope = await resolveReportScope(user, parseQuery(req, reportFilterSchema));
  const group = req.nextUrl.searchParams.get("group") as keyof typeof MEASUREMENT_GROUPS | null;
  return { generatedAt: new Date().toISOString(), from: scope.from, to: scope.to, items: await sensorStatistics(scope, group ? MEASUREMENT_GROUPS[group] : undefined) };
});
