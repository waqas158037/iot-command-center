import { apiRoute, json, parseBody } from "@/lib/http/handler";
import { createAlertRuleSchema } from "@/lib/validation/schemas";
import { createAlertRule, listAlertRules } from "@/server/services/alerts";

export const GET = apiRoute(async ({ req, user }) =>
  listAlertRules(user, {
    projectId: req.nextUrl.searchParams.get("projectId") || undefined,
    page: Number(req.nextUrl.searchParams.get("page") ?? 1) || 1,
    pageSize: Number(req.nextUrl.searchParams.get("pageSize") ?? 50) || 50,
  }),
);

export const POST = apiRoute(async ({ req, user, requestId, ip }) => json(await createAlertRule(user, await parseBody(req, createAlertRuleSchema), { requestId, ip }), 201));
