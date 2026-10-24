import { apiRoute, parseBody } from "@/lib/http/handler";
import { updateDeviceSchema, uuid } from "@/lib/validation/schemas";
import { deleteDevice, getDevice, updateDevice } from "@/server/services/devices";

type P = { id: string };

export const GET = apiRoute<P>(async ({ params, user }) => getDevice(user, uuid.parse(params.id)));

export const PATCH = apiRoute<P>(async ({ req, params, user, requestId, ip }) => updateDevice(user, uuid.parse(params.id), await parseBody(req, updateDeviceSchema), { requestId, ip }));

/** Only devices without telemetry can be deleted; others must be deactivated (PATCH active=false). */
export const DELETE = apiRoute<P>(async ({ params, user, requestId, ip }) => {
  await deleteDevice(user, uuid.parse(params.id), { requestId, ip });
  return { ok: true };
});
