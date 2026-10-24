import bcrypt from "bcryptjs";
import { z } from "zod";

const BCRYPT_COST = 12;

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "Password must contain letters and numbers");

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Compared against when the email is unknown so response timing does not reveal which accounts exist.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKxGhuEaZ.Y0nE3rLBpCxdRrgpnX/0F7fd/9a";
export async function burnPasswordCheck(password: string) {
  await bcrypt.compare(password, DUMMY_HASH);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
