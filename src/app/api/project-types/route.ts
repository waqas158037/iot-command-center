import { apiRoute } from "@/lib/http/handler";
import { listProjectTypes } from "@/server/services/project-types";

export const GET = apiRoute(async () => ({ items: await listProjectTypes() }));
