import { prisma } from "@/lib/db";
import { json, publicRoute } from "@/lib/http/handler";

/** Liveness/readiness probe. Reveals nothing beyond database reachability. */
export const GET = publicRoute(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return json({ status: "ok" });
  } catch {
    return json({ status: "degraded" }, 503);
  }
});
