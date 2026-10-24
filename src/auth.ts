import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { burnPasswordCheck, normalizeEmail, verifyPassword } from "@/lib/auth/password";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/server/services/audit";

class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS, updateAge: 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = normalizeEmail(parsed.data.email);
        const ip = clientIp(request);

        const [byEmail, byIp] = await Promise.all([
          consumeRateLimit(`login:email:${email}`, 5, 15 * 60),
          consumeRateLimit(`login:ip:${ip}`, 30, 15 * 60),
        ]);
        if (!byEmail.allowed || !byIp.allowed) {
          await recordAudit({ action: "auth.login", resourceType: "user", outcome: "DENIED", metadata: { email, reason: "rate_limited" }, ipAddress: ip });
          throw new RateLimitedSignin();
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          await burnPasswordCheck(parsed.data.password);
          await recordAudit({ action: "auth.login", resourceType: "user", outcome: "FAILURE", metadata: { email, reason: "unknown_user" }, ipAddress: ip });
          return null;
        }
        const valid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!valid) {
          await recordAudit({ actorId: user.id, action: "auth.login", resourceType: "user", resourceId: user.id, outcome: "FAILURE", metadata: { reason: "bad_password" }, ipAddress: ip });
          return null;
        }
        if (!user.isActive) {
          await recordAudit({ actorId: user.id, action: "auth.login", resourceType: "user", resourceId: user.id, outcome: "DENIED", metadata: { reason: "inactive" }, ipAddress: ip });
          return null;
        }

        await resetRateLimit(`login:email:${email}`);
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await recordAudit({ actorId: user.id, action: "auth.login", resourceType: "user", resourceId: user.id, ipAddress: ip });
        return { id: user.id, name: user.name, email: user.email, sv: user.sessionVersion };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.sv = (user as { sv?: number }).sv ?? 1;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      (session as { sv?: number }).sv = token.sv as number;
      return session;
    },
  },
});
