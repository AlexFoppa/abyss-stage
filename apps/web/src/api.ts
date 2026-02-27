// src/api.ts
export type ApiError = { status: number; message: string; body?: unknown };

/** Chamado em 401 para limpar sessão (ex.: outra aba deslogou e o cookie sumiu). */
let on401: (() => void) | null = null;
export function setOn401(fn: (() => void) | null) {
  on401 = fn;
}

async function readBody(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text();
  return text ? { text } : null;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;

  const headers: Record<string, string> = { ...(init.headers as any) };
  if (!isFormData) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  } else {
    // Importante: não setar Content-Type aqui (o browser inclui boundary)
    delete headers["Content-Type"];
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  const body = await readBody(res);
  if (res.status === 401 && on401) {
    on401();
  }
  if (!res.ok) {
    const message =
      (body as any)?.detail || (body as any)?.message || res.statusText || "Request failed";
    throw { status: res.status, message, body } satisfies ApiError;
  }
  return body as T;
}


