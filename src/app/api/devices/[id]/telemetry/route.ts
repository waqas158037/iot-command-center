import { apiRoute, parseQuery } from "@/lib/http/handler";
import { telemetryQuerySchema, uuid } from "@/lib/validation/schemas";
import { deviceLatest, telemetryHistory } from "@/server/services/telemetry-query";

type P = { id: string };

/** ?latest=true returns the latest reading per sensor; otherwise bucketed history. */
export const GET = apiRoute<P>(async ({ req, params, user }) => {
  const deviceId = uuid.parse(params.id);
  if (req.nextUrl.searchParams.get("latest") === "true") return { items: await deviceLatest(user, deviceId) };
  const q = parseQuery(req, telemetryQuerySchema);
  return telemetryHistory(user, { ...q, deviceId, sensorId: undefined, projectId: undefined });
});
