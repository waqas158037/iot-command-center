import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodType } from "zod";
import { AppError, badRequest } from "./errors";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { logger } from "@/lib/logging/logger";
import { newRequestId } from "@/lib/crypto";
import { searchParamsToObject } from "./pagination";

export interface RouteContext<P> {
  req: NextRequest;
  params: P;
  requestId: string;
  ip: string;
}

export interface AuthedRouteContext<P> extends RouteContext<P> {
  user: CurrentUser;
}

type Handler<C> = (ctx: C) => Promise<Response | unknown>;

function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return value;
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new NextResponse(JSON.stringify(data, jsonReplacer), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

export function errorResponse(err: unknown, requestId: string): Response {
  if (err instanceof AppError) {
    const headers: Record<string, string> = { "X-Request-Id": requestId };
    if (err.status === 429 && typeof (err.details as { retryAfterSeconds?: number })?.retryAfterSeconds === "number") {
      headers["Retry-After"] = String((err.details as { retryAfterSeconds: number }).retryAfterSeconds);
    }
    return json({ error: { code: err.code, message: err.message, details: err.details ?? undefined, requestId } }, err.status, headers);
  }
  if (err instanceof ZodError) {
    return json(
      { error: { code: "VALIDATION_FAILED", message: "Request validation failed", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })), requestId } },
      400,
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return json({ error: { code: "CONFLICT", message: "A record with these unique values already exists", requestId } }, 409);
    if (err.code === "P2025") return json({ error: { code: "NOT_FOUND", message: "Resource not found", requestId } }, 404);
    if (err.code === "P2003") return json({ error: { code: "CONFLICT", message: "Operation conflicts with related records", requestId } }, 409);
  }
  logger.error({ err, requestId }, "unhandled API error");
  return json({ error: { code: "INTERNAL", message: "Internal server error", requestId } }, 500);
}

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

async function run<C extends RouteContext<unknown>>(ctx: C, handler: Handler<C>): Promise<Response> {
  try {
    const result = await handler(ctx);
    const res = result instanceof Response ? result : json(result ?? { ok: true });
    res.headers.set("X-Request-Id", ctx.requestId);
    return res;
  } catch (err) {
    return errorResponse(err, ctx.requestId);
  }
}

/** Authenticated JSON route. Every handler gets a DB-validated user or the caller receives 401. */
export function apiRoute<P = Record<string, never>>(handler: Handler<AuthedRouteContext<P>>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    const requestId = req.headers.get("x-request-id")?.slice(0, 64) || newRequestId();
    const params = (await context?.params) ?? ({} as P);
    const base = { req, params, requestId, ip: clientIp(req) };
    return run(base as AuthedRouteContext<P>, async (ctx) => {
      const user = await getCurrentUser();
      if (!user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
      return handler({ ...ctx, user });
    });
  };
}

/** Route without a user session (device ingestion, broker hooks). The handler must authenticate itself. */
export function publicRoute<P = Record<string, never>>(handler: Handler<RouteContext<P>>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    const requestId = req.headers.get("x-request-id")?.slice(0, 64) || newRequestId();
    const params = (await context?.params) ?? ({} as P);
    return run({ req, params, requestId, ip: clientIp(req) }, handler);
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const text = await req.text();
  if (text.length > 256 * 1024) throw badRequest("Request body too large");
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  return schema.parse(data);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(searchParamsToObject(req.nextUrl.searchParams));
}
