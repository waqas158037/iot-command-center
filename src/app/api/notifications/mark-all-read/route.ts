import { apiRoute } from "@/lib/http/handler";
import { markAllRead } from "@/server/services/notifications";

export const POST = apiRoute(async ({ user }) => markAllRead(user));
