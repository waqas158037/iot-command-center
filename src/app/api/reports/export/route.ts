import { apiRoute, parseQuery } from "@/lib/http/handler";
import { badRequest } from "@/lib/http/errors";
import { reportFilterSchema, resolveReportScope } from "@/server/services/reports";
import { buildExport, EXPORT_KINDS, type ExportKind } from "@/server/services/exports";
import { csvResponse } from "@/lib/exports/csv";
import { recordAudit } from "@/server/services/audit";

/** CSV export. Only projects where the caller holds report.export are included. */
export const GET = apiRoute(async ({ req, user, requestId, ip }) => {
  const kind = req.nextUrl.searchParams.get("report") as ExportKind;
  if (!EXPORT_KINDS.includes(kind)) throw badRequest(`report must be one of ${EXPORT_KINDS.join(", ")}`);
  const filter = parseQuery(req, reportFilterSchema);
  const scope = await resolveReportScope(user, filter, "report.export");
  const { filename, csv, rows } = await buildExport(kind, scope, req.nextUrl.searchParams.get("group"));
  await recordAudit({ actorId: user.id, action: "report.export", resourceType: "report", resourceId: kind, metadata: { ...filter, rows, projects: scope.projectIds.length }, requestId, ipAddress: ip });
  return csvResponse(filename, csv);
});
