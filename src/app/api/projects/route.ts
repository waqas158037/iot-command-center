import { apiRoute, json, parseBody, parseQuery } from "@/lib/http/handler";
import { createProjectSchema, listProjectsSchema } from "@/lib/validation/schemas";
import { createProject, listProjects } from "@/server/services/projects";

export const GET = apiRoute(async ({ req, user }) => listProjects(user, parseQuery(req, listProjectsSchema)));

export const POST = apiRoute(async ({ req, user, requestId, ip }) => {
  const body = await parseBody(req, createProjectSchema);
  return json(await createProject(user, body, { requestId, ip }), 201);
});
