import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/http/handler";
import { uuid } from "@/lib/validation/schemas";
import { setNotificationRead } from "@/server/services/notifications";

export const PATCH = apiRoute<{ id: string }>(async ({ req, params, user }) => {
  const body = await parseBody(req, z.object({ read: z.boolean() }));
  await setNotificationRead(user, uuid.parse(params.id), body.read);
  return { ok: true };
});
