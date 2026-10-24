import { apiRoute, parseBody } from "@/lib/http/handler";
import { updateSensorSchema, uuid } from "@/lib/validation/schemas";
import { deleteSensor, getSensor, updateSensor } from "@/server/services/devices";

type P = { id: string };

export const GET = apiRoute<P>(async ({ params, user }) => getSensor(user, uuid.parse(params.id)));
export const PATCH = apiRoute<P>(async ({ req, params, user, requestId, ip }) => updateSensor(user, uuid.parse(params.id), await parseBody(req, updateSensorSchema), { requestId, ip }));
export const DELETE = apiRoute<P>(async ({ params, user, requestId, ip }) => {
  await deleteSensor(user, uuid.parse(params.id), { requestId, ip });
  return { ok: true };
});
