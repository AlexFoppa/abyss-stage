// src/api.ts
export type ApiError = {
  status: number;
  message: string;
  body?: unknown;
  /** Present when the failure came from fetch (helps debug proxy vs API). */
  method?: string;
  path?: string;
};

/** Chamado em 401 para limpar sessão (ex.: outra aba deslogou e o cookie sumiu). */
let on401: (() => void) | null = null;
export function setOn401(fn: (() => void) | null) {
  on401 = fn;
}

async function readBody(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (res.status === 204 || res.status === 205) return null;
  if (ct.includes("application/json")) {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
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

  const method = (init.method || "GET").toUpperCase();

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
    const raw =
      (body as any)?.detail ?? (body as any)?.message ?? res.statusText ?? "Request failed";
    const detailStr =
      typeof raw === "string"
        ? raw
        : raw !== undefined && raw !== null
          ? JSON.stringify(raw)
          : res.statusText || "Request failed";
    const message = `${method} ${path} → ${res.status}: ${detailStr}`;
    throw { status: res.status, message, body, method, path } satisfies ApiError;
  }
  return body as T;
}


