// src/api.ts
export type ApiError = { status: number; message: string; body?: unknown };

async function readBody(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text();
  return text ? { text } : null;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    credentials: "include",
  });

  const body = await readBody(res);
  if (!res.ok) {
    const message =
      (body as any)?.detail || (body as any)?.message || res.statusText || "Request failed";
    throw { status: res.status, message, body } satisfies ApiError;
  }
  return body as T;
}
