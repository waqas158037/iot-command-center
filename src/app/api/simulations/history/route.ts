import { z } from "zod";
import { simulatorAllowed } from "@/lib/env";
import { featureDisabled } from "@/lib/http/errors";
import { apiRoute, parseBody } from "@/lib/http/handler";
import { assertProjectAction } from "@/server/services/access";
import { recordAudit } from "@/server/services/audit";
import { generateHistory } from "@/server/services/simulation";

const schema = z.object({
  projectId: z.string().uuid(),
  hours: z.coerce.number().int().min(1).max(24 * 14).default(24),
  intervalMinutes: z.coerce.number().int().min(1).max(240).default(10),
  deviceCount: z.coerce.number().int().min(1).max(10).default(2),
});

/** Backfills labelled SIMULATED history for demos (bounded: 14 days, 10 devices). */
export const POST = apiRoute(async ({ req, user, requestId, ip }) => {
  if (!simulatorAllowed()) throw featureDisabled("The simulator is disabled on this deployment");
  const body = await parseBody(req, schema);
  await assertProjectAction(user, body.projectId, "simulation.control");
  const result = await generateHistory(body.projectId, body);
  await recordAudit({ actorId: user.id, action: "simulation.history", resourceType: "project", resourceId: body.projectId, metadata: { ...body, ...result }, requestId, ipAddress: ip });
  return result;
});
