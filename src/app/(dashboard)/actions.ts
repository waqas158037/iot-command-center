"use server";

import { signOut } from "@/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/server/services/audit";

export async function signOutAction() {
  const user = await getCurrentUser();
  if (user) await recordAudit({ actorId: user.id, action: "auth.logout", resourceType: "user", resourceId: user.id });
  await signOut({ redirectTo: "/login" });
}
