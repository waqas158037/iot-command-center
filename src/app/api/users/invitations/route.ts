import { apiRoute, json, parseBody } from "@/lib/http/handler";
import { inviteUserSchema } from "@/lib/validation/schemas";
import { inviteUser } from "@/server/services/users";

export const POST = apiRoute(async ({ req, user, requestId, ip }) => json(await inviteUser(user, await parseBody(req, inviteUserSchema), { requestId, ip }), 201));
