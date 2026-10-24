import { apiRoute, parseQuery } from "@/lib/http/handler";
import { listAlertsSchema } from "@/lib/validation/schemas";
import { listAlerts } from "@/server/services/alerts";

export const GET = apiRoute(async ({ req, user }) => listAlerts(user, parseQuery(req, listAlertsSchema)));
