import nodemailer from "nodemailer";
import { env, smtpConfigured } from "@/lib/env";
import { logger } from "@/lib/logging/logger";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!smtpConfigured()) return null;
  if (!transporter) {
    const e = env();
    transporter = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_PORT === 465,
      auth: e.SMTP_USERNAME ? { user: e.SMTP_USERNAME, pass: e.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

/** Sends an email when SMTP is configured. Returns false (and sends nothing) otherwise. */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  await t.sendMail({ from: env().SMTP_FROM, to, subject, text });
  logger.info({ subject }, "email sent");
  return true;
}
