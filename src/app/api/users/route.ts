import { apiRoute } from "@/lib/http/handler";
import { listUsers } from "@/server/services/users";

export const GET = apiRoute(async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  return listUsers(user, { search: sp.get("search") || undefined, role: sp.get("role") || undefined, status: sp.get("status") || undefined, page: Number(sp.get("page") ?? 1) || 1, pageSize: Number(sp.get("pageSize") ?? 20) || 20 });
});
