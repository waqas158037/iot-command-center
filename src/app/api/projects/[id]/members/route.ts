import { apiRoute, json, parseBody } from "@/lib/http/handler";
import { addMemberSchema, uuid } from "@/lib/validation/schemas";
import { addMember, listMembers } from "@/server/services/projects";

type P = { id: string };

export const GET = apiRoute<P>(async ({ params, user }) => ({ items: await listMembers(user, uuid.parse(params.id)) }));

export const POST = apiRoute<P>(async ({ req, params, user, requestId, ip }) => {
  const body = await parseBody(req, addMemberSchema);
  return json(await addMember(user, uuid.parse(params.id), body.userId, body.projectRole, { requestId, ip }), 201);
});
