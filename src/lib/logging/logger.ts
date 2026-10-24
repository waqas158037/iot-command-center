import pino from "pino";

/**
 * Structured JSON logger. Credential-bearing fields are redacted wherever they appear
 * so device secrets, passwords and tokens never reach log storage.
 */
export const REDACT_PATHS = [
  "password",
  "passwordHash",
  "token",
  "secret",
  "authorization",
  "cookie",
  "credentialHash",
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.secret",
  "*.authorization",
  "*.cookie",
  "*.credentialHash",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  base: { service: process.env.SERVICE_NAME ?? "iot-command-center" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
