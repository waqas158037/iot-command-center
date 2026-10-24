export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "FEATURE_DISABLED"
  | "INTERNAL";

/** An error that is safe to show to API callers. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, "BAD_REQUEST", message, details);
export const unauthenticated = (message = "Authentication required") => new AppError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "You do not have permission to perform this action") => new AppError(403, "FORBIDDEN", message);
/** Also used when a resource exists but the caller may not know it does (prevents IDOR probing). */
export const notFound = (resource = "Resource") => new AppError(404, "NOT_FOUND", `${resource} not found`);
export const conflict = (message: string, details?: unknown) => new AppError(409, "CONFLICT", message, details);
export const rateLimited = (retryAfterSeconds: number) =>
  new AppError(429, "RATE_LIMITED", "Too many requests, please try again later", { retryAfterSeconds });
export const featureDisabled = (message: string) => new AppError(403, "FEATURE_DISABLED", message);
