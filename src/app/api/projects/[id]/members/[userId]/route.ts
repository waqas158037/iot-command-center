import { apiRoute, parseBody } from "@/lib/http/handler";
import { updateMemberSchema, uuid } from "@/lib/validation/schemas";
import { removeMember, updateMember } from "@/server/services/projects";

type P = { id: string; userId: string };

export const PATCH = apiRoute<P>(async ({ req, params, user, requestId, ip }) => {
  const body = await parseBody(req, updateMemberSchema);
  return updateMember(user, uuid.parse(params.id), uuid.parse(params.userId), body.projectRole, { requestId, ip });
});

export const DELETE = apiRoute<P>(async ({ params, user, requestId, ip }) => {
  await removeMember(user, uuid.parse(params.id), uuid.parse(params.userId), { requestId, ip });
  return { ok: true };
});
