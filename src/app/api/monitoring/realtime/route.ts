import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { realtimeHub } from "@/lib/realtime/hub";
import type { RealtimeEvent } from "@/lib/realtime/events";
import { accessibleProjectIds } from "@/server/services/access";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream of telemetry, alert and device-status events.
 * Each subscriber only receives events for projects it can access; access is re-checked every
 * 60 seconds and the stream closes if the user is deactivated or signed out.
 * Optional ?projectId= / ?deviceId= narrow the stream further.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }), { status: 401, headers: { "Content-Type": "application/json" } });

  const url = new URL(req.url);
  const projectFilter = url.searchParams.get("projectId");
  const deviceFilter = url.searchParams.get("deviceId");
  let allowed = await accessibleProjectIds(user);
  if (projectFilter && allowed && !allowed.includes(projectFilter)) {
    return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Project not found" } }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: NodeJS.Timeout | undefined;
  let recheck: NodeJS.Timeout | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
        clearInterval(recheck);
        try {
          controller.close();
        } catch {}
      };
      const permitted = (e: RealtimeEvent) => {
        if (projectFilter && e.projectId !== projectFilter) return false;
        if (deviceFilter && "deviceId" in e && e.deviceId !== deviceFilter) return false;
        return allowed === null || allowed.includes(e.projectId);
      };

      controller.enqueue(encoder.encode(`retry: 5000\n\n`));
      send("ready", { connectedAt: new Date().toISOString(), listening: realtimeHub.connected });
      unsubscribe = realtimeHub.subscribe((e) => permitted(e) && send(e.type, e));
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, 15_000);
      recheck = setInterval(async () => {
        const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { isActive: true } });
        if (!fresh?.isActive) return cleanup();
        allowed = await accessibleProjectIds(user);
      }, 60_000);
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      unsubscribe();
      clearInterval(heartbeat);
      clearInterval(recheck);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
