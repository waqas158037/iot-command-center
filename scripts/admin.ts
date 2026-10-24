/**
 * Administrator bootstrap and recovery.
 *
 *   npm run admin:create -- --email admin@example.com --name "Ada Admin"
 *   npm run admin:reset-password -- --email admin@example.com
 *
 * The password comes from the ADMIN_PASSWORD environment variable, or from stdin with
 * --password-stdin. If neither is given a strong random password is generated and printed once.
 * No default administrator password exists anywhere in the codebase.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword, normalizeEmail, passwordSchema } from "../src/lib/auth/password";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function resolvePassword(): Promise<{ password: string; generated: boolean }> {
  let password = process.argv.includes("--password-stdin") ? await readStdin() : process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = randomBytes(18).toString("base64url") + "9a";
    generated = true;
  }
  const check = passwordSchema.safeParse(password);
  if (!check.success) throw new Error(check.error.issues[0].message);
  return { password, generated };
}

async function main() {
  const command = process.argv[2];
  const emailArg = arg("email");
  if (!emailArg || !["create", "reset-password"].includes(command)) {
    console.error("Usage: tsx scripts/admin.ts <create|reset-password> --email <email> [--name <name>] [--password-stdin]");
    process.exit(1);
  }
  const email = normalizeEmail(emailArg);
  const { password, generated } = await resolvePassword();
  const passwordHash = await hashPassword(password);

  if (command === "create") {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new Error(`A user with email ${email} already exists. Use reset-password instead.`);
    const user = await prisma.user.create({ data: { email, name: arg("name") ?? "Platform Administrator", passwordHash, role: "SUPER_ADMIN", isActive: true } });
    await prisma.auditLog.create({ data: { action: "user.bootstrap_admin", resourceType: "user", resourceId: user.id, outcome: "SUCCESS", metadata: { via: "cli" } } });
    console.log(`Created SUPER_ADMIN ${email}`);
  } else {
    const user = await prisma.user.update({ where: { email }, data: { passwordHash, isActive: true, sessionVersion: { increment: 1 } } });
    await prisma.auditLog.create({ data: { action: "auth.password_reset.cli", resourceType: "user", resourceId: user.id, outcome: "SUCCESS" } });
    console.log(`Password reset for ${email}; existing sessions were signed out.`);
  }
  if (generated) console.log(`Generated password (shown once, store it securely): ${password}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
