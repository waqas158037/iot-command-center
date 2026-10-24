import { apiRoute, parseBody } from "@/lib/http/handler";
import { alertActionSchema, uuid } from "@/lib/validation/schemas";
import { actOnAlert, getAlert } from "@/server/services/alerts";

type P = { id: string };

export const GET = apiRoute<P>(async ({ params, user }) => getAlert(user, uuid.parse(params.id)));

/** Body: { action: "acknowledge" | "resolve" | "note", notes?: string } */
export const PATCH = apiRoute<P>(async ({ req, params, user, requestId, ip }) => actOnAlert(user, uuid.parse(params.id), await parseBody(req, alertActionSchema), { requestId, ip }));
