import { apiRoute } from "@/lib/http/handler";
import { notFound } from "@/lib/http/errors";
import { getProjectTypeByKey } from "@/server/services/project-types";

export const GET = apiRoute<{ key: string }>(async ({ params }) => {
  const type = await getProjectTypeByKey(params.key);
  if (!type) throw notFound("Project type");
  return type;
});
