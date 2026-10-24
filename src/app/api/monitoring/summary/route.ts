import { z } from "zod";
import { apiRoute, parseQuery } from "@/lib/http/handler";
import { ENUMS } from "@/lib/validation/schemas";
import { dashboardSummary } from "@/server/services/monitoring";

const schema = z.object({
  projectId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  deviceId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  category: z.preprocess((v) => (v === "" ? undefined : v), z.enum(ENUMS.CATEGORIES).optional()),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Dashboard figures; also the documented polling fallback when SSE is unavailable. */
export const GET = apiRoute(async ({ req, user }) => dashboardSummary(user, parseQuery(req, schema)));
