import { apiRoute, parseBody } from "@/lib/http/handler";
import { updateUserSchema, uuid } from "@/lib/validation/schemas";
import { updateUser } from "@/server/services/users";

export const PATCH = apiRoute<{ id: string }>(async ({ req, params, user, requestId, ip }) => updateUser(user, uuid.parse(params.id), await parseBody(req, updateUserSchema), { requestId, ip }));
