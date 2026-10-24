"use client";

export class ApiClientError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** Fetch wrapper for client components: JSON in/out, readable error messages. */
export async function apiFetch<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data?.error;
    const detail = Array.isArray(err?.details) ? err.details.map((d: { path?: string; message: string }) => (d.path ? `${d.path}: ${d.message}` : d.message)).join("; ") : "";
    throw new ApiClientError(res.status, [err?.message ?? `Request failed (${res.status})`, detail].filter(Boolean).join(" — "), err?.details);
  }
  return data as T;
}
