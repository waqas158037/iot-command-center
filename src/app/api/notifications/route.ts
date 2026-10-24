import { apiRoute } from "@/lib/http/handler";
import { listNotifications } from "@/server/services/notifications";

export const GET = apiRoute(async ({ req, user }) =>
  listNotifications(user, {
    page: Number(req.nextUrl.searchParams.get("page") ?? 1) || 1,
    pageSize: Number(req.nextUrl.searchParams.get("pageSize") ?? 20) || 20,
    unreadOnly: req.nextUrl.searchParams.get("unread") === "true",
  }),
);
