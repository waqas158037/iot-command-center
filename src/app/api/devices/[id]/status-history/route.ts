import { apiRoute } from "@/lib/http/handler";
import { uuid } from "@/lib/validation/schemas";
import { deviceStatusHistory } from "@/server/services/devices";

export const GET = apiRoute<{ id: string }>(async ({ req, params, user }) => ({
  items: await deviceStatusHistory(user, uuid.parse(params.id), Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50),
}));
