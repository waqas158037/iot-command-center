"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { hashPassword, passwordSchema, verifyPassword } from "@/lib/auth/password";
import { AppError } from "@/lib/http/errors";
import { updateNotificationPreferences, updateProfile } from "@/server/services/users";
import { updateSettings } from "@/server/services/settings";
import { recordAudit } from "@/server/services/audit";
import { signOut } from "@/auth";

export interface SettingsState {
  error?: string;
  success?: string;
}

function message(err: unknown) {
  if (err instanceof z.ZodError) return err.issues.map((i) => i.message).join("; ");
  if (err instanceof AppError) return err.message;
  throw err;
}

export async function profileAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser();
  try {
    await updateProfile(user, { name: String(form.get("name") ?? ""), timezone: String(form.get("timezone") ?? "") });
    revalidatePath("/", "layout");
    return { success: "Profile saved" };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function preferencesAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser();
  try {
    await updateNotificationPreferences(user, {
      minSeverity: form.get("minSeverity"),
      deviceOffline: form.get("deviceOffline") === "on",
      alertUpdates: form.get("alertUpdates") === "on",
      email: form.get("email") === "on",
    });
    return { success: "Preferences saved" };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function platformSettingsAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser();
  try {
    await updateSettings(user, Object.fromEntries(form));
    revalidatePath("/settings");
    return { success: "Platform settings saved" };
  } catch (err) {
    return { error: message(err) };
  }
}

const passwordChange = z.object({ current: z.string().min(1, "Enter your current password"), next: passwordSchema, confirm: z.string() }).refine((d) => d.next === d.confirm, { message: "The new passwords do not match", path: ["confirm"] });

/** Changing the password invalidates every existing session, including this one. */
export async function passwordAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = passwordChange.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row.passwordHash || !(await verifyPassword(parsed.data.current, row.passwordHash))) {
    await recordAudit({ actorId: user.id, action: "user.password.change", outcome: "FAILURE", resourceType: "user", resourceId: user.id, metadata: { reason: "wrong current password" } });
    return { error: "Your current password is incorrect" };
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.next), sessionVersion: { increment: 1 } } });
  await recordAudit({ actorId: user.id, action: "user.password.change", resourceType: "user", resourceId: user.id });
  await signOut({ redirectTo: "/login?reset=1" });
  return {};
}
