import { apiRoute, parseBody } from "@/lib/http/handler";
import { updateProjectSchema } from "@/lib/validation/schemas";
import { archiveProject, getProject, updateProject } from "@/server/services/projects";
import { uuid } from "@/lib/validation/schemas";

type P = { id: string };

export const GET = apiRoute<P>(async ({ params, user }) => getProject(user, uuid.parse(params.id)));

export const PATCH = apiRoute<P>(async ({ req, params, user, requestId, ip }) =>
  updateProject(user, uuid.parse(params.id), await parseBody(req, updateProjectSchema), { requestId, ip }),
);

/** Projects are archived, never hard-deleted, so historical telemetry and alerts stay intact. */
export const DELETE = apiRoute<P>(async ({ params, user, requestId, ip }) => archiveProject(user, uuid.parse(params.id), { requestId, ip }));
