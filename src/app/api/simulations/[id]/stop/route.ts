import { apiRoute } from "@/lib/http/handler";
import { uuid } from "@/lib/validation/schemas";
import { setSimulationStatus } from "@/server/services/simulation";

export const POST = apiRoute<{ id: string }>(async ({ params, user, requestId, ip }) => setSimulationStatus(user, uuid.parse(params.id), "STOPPED", { requestId, ip }));
