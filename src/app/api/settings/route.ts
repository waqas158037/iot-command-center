import { apiRoute } from "@/lib/http/handler";
import { assertGlobal } from "@/server/services/access";
import { getSettings, integrationStatus, updateSettings } from "@/server/services/settings";

export const GET = apiRoute(async ({ user }) => {
  assertGlobal(user, "settings.manage");
  return { settings: await getSettings(), integrations: integrationStatus() };
});

export const PATCH = apiRoute(async ({ req, user, requestId, ip }) => updateSettings(user, await req.json().catch(() => ({})), { requestId, ip }));
