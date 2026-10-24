import { apiRoute } from "@/lib/http/handler";
import { uuid } from "@/lib/validation/schemas";
import { updateSimulation } from "@/server/services/simulation";

/** Pause/resume ({ status }) or change interval, scenario and device count. */
export const PATCH = apiRoute<{ id: string }>(async ({ req, params, user, requestId, ip }) => updateSimulation(user, uuid.parse(params.id), await req.json().catch(() => ({})), { requestId, ip }));
