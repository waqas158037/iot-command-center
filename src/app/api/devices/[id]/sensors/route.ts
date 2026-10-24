import { apiRoute, json, parseBody } from "@/lib/http/handler";
import { createSensorSchema, uuid } from "@/lib/validation/schemas";
import { createSensor, listSensorsForDevice } from "@/server/services/devices";

type P = { id: string };

export const GET = apiRoute<P>(async ({ params, user }) => ({ items: await listSensorsForDevice(user, uuid.parse(params.id)) }));

export const POST = apiRoute<P>(async ({ req, params, user, requestId, ip }) => json(await createSensor(user, uuid.parse(params.id), await parseBody(req, createSensorSchema), { requestId, ip }), 201));
