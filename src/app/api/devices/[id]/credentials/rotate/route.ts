import { apiRoute, json, parseBody } from "@/lib/http/handler";
import { rotateCredentialSchema, uuid } from "@/lib/validation/schemas";
import { rotateDeviceCredential } from "@/server/services/devices";

/** Issues a new secret (returned once) and revokes or time-limits the previous ones. */
export const POST = apiRoute<{ id: string }>(async ({ req, params, user, requestId, ip }) =>
  json(await rotateDeviceCredential(user, uuid.parse(params.id), await parseBody(req, rotateCredentialSchema), { requestId, ip }), 201),
);
