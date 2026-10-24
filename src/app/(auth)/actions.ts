"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/auth";
import { prisma } from "@/lib/db";
import { env, smtpConfigured } from "@/lib/env";
import { hashPassword, normalizeEmail, passwordSchema } from "@/lib/auth/password";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { sendMail } from "@/lib/mail";
import { consumeRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/server/services/audit";
import { headers } from "next/headers";

export interface FormState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const callbackUrl = String(formData.get("callbackUrl") || "/dashboard");
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      // Only allow same-origin relative redirects.
      redirectTo: callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/dashboard",
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      if ((err as { code?: string }).code === "rate_limited") return { error: "Too many sign-in attempts. Please wait 15 minutes and try again." };
      return { error: "Invalid email or password, or the account is inactive." };
    }
    throw err; // includes the redirect thrown on success
  }
}

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  email: z.string().trim().email("Enter a valid email").max(254),
  password: passwordSchema,
  invite: z.string().optional(),
});

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const limit = await consumeRateLimit(`register:${await ip()}`, 10, 3600);
  if (!limit.allowed) return { error: "Too many attempts. Please try again later." };

  const email = normalizeEmail(parsed.data.email);
  let role: "VIEWER" | "ENGINEER" | "PROJECT_MANAGER" | "SUPER_ADMIN" = "VIEWER";
  let invitationId: string | undefined;

  if (parsed.data.invite) {
    const invitation = await prisma.userInvitation.findUnique({ where: { tokenHash: sha256Hex(parsed.data.invite) } });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt < new Date() || invitation.email !== email) {
      return { error: "This invitation is invalid, expired, or for a different email address." };
    }
    role = invitation.role;
    invitationId = invitation.id;
  } else if (!env().ENABLE_REGISTRATION) {
    return { error: "Self-registration is disabled. Ask an administrator for an invitation." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  // Same response whether or not the email exists, so registration cannot be used to enumerate accounts.
  if (existing) return { success: "If this email can be registered, the account has been created. Please sign in." };

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { name: parsed.data.name, email, passwordHash, role } });
    if (invitationId) await tx.userInvitation.update({ where: { id: invitationId }, data: { acceptedAt: new Date() } });
    return created;
  });
  await recordAudit({ actorId: user.id, action: invitationId ? "user.invitation.accept" : "user.register", resourceType: "user", resourceId: user.id, metadata: { role } });
  return { success: "If this email can be registered, the account has been created. Please sign in." };
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const generic: FormState = { success: "If an account exists for that email, a reset link has been sent." };
  if (!smtpConfigured()) return { error: "Password reset by email is not configured. Contact an administrator." };
  if (!z.string().email().safeParse(email).success) return { fieldErrors: { email: "Enter a valid email" } };

  const limit = await consumeRateLimit(`pwreset:${email}`, 3, 3600);
  if (!limit.allowed) return generic;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return generic;

  const token = randomToken(32);
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
  const link = `${env().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail(email, "Reset your IoT Command Center password", `Use this link within 30 minutes to reset your password:\n\n${link}\n\nIf you did not request this, ignore this email.`);
  await recordAudit({ actorId: user.id, action: "auth.password_reset.request", resourceType: "user", resourceId: user.id });
  return generic;
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { fieldErrors: { password: password.error.issues[0].message } };
  if (formData.get("password") !== formData.get("confirm")) return { fieldErrors: { confirm: "Passwords do not match" } };

  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256Hex(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) return { error: "This reset link is invalid or has expired." };

  const passwordHash = await hashPassword(password.data);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash, sessionVersion: { increment: 1 } } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null, id: { not: record.id } } }),
  ]);
  await recordAudit({ actorId: record.userId, action: "auth.password_reset.complete", resourceType: "user", resourceId: record.userId });
  return { success: "Your password has been reset. You can now sign in." };
}
