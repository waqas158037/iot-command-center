import { z } from "zod";
import { apiRoute, parseQuery } from "@/lib/http/handler";
import { listAuditLogs } from "@/server/services/users";

const schema = z.object({
  search: z.string().max(100).optional(),
  action: z.string().max(80).optional(),
  outcome: z.string().max(20).optional(),
  resourceType: z.string().max(40).optional(),
  actorId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = apiRoute(async ({ req, user }) => listAuditLogs(user, parseQuery(req, schema)));
