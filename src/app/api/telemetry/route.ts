import { apiRoute, parseQuery } from "@/lib/http/handler";
import { telemetryQuerySchema } from "@/lib/validation/schemas";
import { rawReadings, telemetryHistory } from "@/server/services/telemetry-query";

/** Bucketed history for a project/device/sensor, or paginated raw readings with ?raw=true. */
export const GET = apiRoute(async ({ req, user }) => {
  const q = parseQuery(req, telemetryQuerySchema);
  if (req.nextUrl.searchParams.get("raw") === "true") {
    return rawReadings(user, { ...q, page: Number(req.nextUrl.searchParams.get("page") ?? 1) || 1, pageSize: Number(req.nextUrl.searchParams.get("pageSize") ?? 50) || 50 });
  }
  return telemetryHistory(user, q);
});
