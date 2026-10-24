import { apiRoute } from "@/lib/http/handler";
import { uuid } from "@/lib/validation/schemas";
import { revokeDeviceCredentials } from "@/server/services/devices";

export const POST = apiRoute<{ id: string }>(async ({ params, user, requestId, ip }) => revokeDeviceCredentials(user, uuid.parse(params.id), { requestId, ip }));
