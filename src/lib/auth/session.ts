import { cache } from "react";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { unauthenticated } from "@/lib/http/errors";
import type { Actor } from "@/lib/permissions/policies";

export interface CurrentUser extends Actor {
  name: string;
  email: string;
  timezone: string;
  role: UserRole;
}

/**
 * Resolves the signed-in user from the session cookie and re-validates it against the database
 * on every request: deactivated users and bumped session versions are rejected immediately,
 * and the role always comes from the database, never from the client or the token.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const sv = (session as { sv?: number }).sv;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, isActive: true, timezone: true, sessionVersion: true },
  });
  if (!user || !user.isActive || user.sessionVersion !== sv) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive, timezone: user.timezone };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  return user;
}

/** For server components: redirects to the login page instead of throwing. */
export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
