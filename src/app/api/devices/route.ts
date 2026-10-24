import { apiRoute, json, parseBody, parseQuery } from "@/lib/http/handler";
import { createDeviceSchema, listDevicesSchema } from "@/lib/validation/schemas";
import { createDevice, listDevices } from "@/server/services/devices";

export const GET = apiRoute(async ({ req, user }) => listDevices(user, parseQuery(req, listDevicesSchema)));

/** The response contains the device secret exactly once; it cannot be retrieved again. */
export const POST = apiRoute(async ({ req, user, requestId, ip }) => json(await createDevice(user, await parseBody(req, createDeviceSchema), { requestId, ip }), 201));
