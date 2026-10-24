import { apiRoute, parseQuery } from "@/lib/http/handler";
import { telemetryQuerySchema, uuid } from "@/lib/validation/schemas";
import { rawReadings, telemetryHistory } from "@/server/services/telemetry-query";

/** ?raw=true returns paginated individual readings; otherwise bucketed history. */
export const GET = apiRoute<{ id: string }>(async ({ req, params, user }) => {
  const sensorId = uuid.parse(params.id);
  const q = parseQuery(req, telemetryQuerySchema);
  if (req.nextUrl.searchParams.get("raw") === "true") {
    const page = Number(req.nextUrl.searchParams.get("page") ?? 1) || 1;
    const pageSize = Number(req.nextUrl.searchParams.get("pageSize") ?? 50) || 50;
    return rawReadings(user, { ...q, sensorId, page, pageSize });
  }
  return telemetryHistory(user, { ...q, sensorId });
});
