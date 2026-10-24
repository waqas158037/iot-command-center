import { apiRoute, parseQuery } from "@/lib/http/handler";
import { projectOverviewReport, reportFilterSchema, resolveReportScope } from "@/server/services/reports";

export const GET = apiRoute(async ({ req, user }) => {
  const scope = await resolveReportScope(user, parseQuery(req, reportFilterSchema));
  return { generatedAt: new Date().toISOString(), from: scope.from, to: scope.to, items: await projectOverviewReport(scope) };
});
