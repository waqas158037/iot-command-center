import { apiRoute, json } from "@/lib/http/handler";
import { createSimulation, listSimulations } from "@/server/services/simulation";

export const GET = apiRoute(async ({ req, user }) => ({ items: await listSimulations(user, req.nextUrl.searchParams.get("projectId") || undefined) }));

/**
 * Creates a RUNNING simulation session. No process is spawned here: the single background
 * worker (holding the simulator lease) picks the session up on its next tick.
 */
export const POST = apiRoute(async ({ req, user, requestId, ip }) => json(await createSimulation(user, await req.json().catch(() => ({})), { requestId, ip }), 201));
