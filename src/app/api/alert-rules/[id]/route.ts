import { apiRoute, parseBody } from "@/lib/http/handler";
import { updateAlertRuleSchema, uuid } from "@/lib/validation/schemas";
import { deleteAlertRule, getAlertRule, updateAlertRule } from "@/server/services/alerts";

type P = { id: string };

export const GET = apiRoute<P>(async ({ params, user }) => getAlertRule(user, uuid.parse(params.id)));
export const PATCH = apiRoute<P>(async ({ req, params, user, requestId, ip }) => updateAlertRule(user, uuid.parse(params.id), await parseBody(req, updateAlertRuleSchema), { requestId, ip }));
/** Rules that produced alerts are disabled instead of deleted to preserve history. */
export const DELETE = apiRoute<P>(async ({ params, user, requestId, ip }) => deleteAlertRule(user, uuid.parse(params.id), { requestId, ip }));
