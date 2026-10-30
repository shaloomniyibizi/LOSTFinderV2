/** Small helper around fetch() for calling one branch's API. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** status 0 = the branch could not be reached at all (server down, network problem). */
export function isOffline(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
}

interface Options {
  method?: string;
  token?: string | null;
  json?: unknown;
  form?: FormData | URLSearchParams;
  timeoutMs?: number;
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length) {
      // FastAPI validation errors: [{loc: [...], msg: "..."}]
      return detail
        .map((d: { loc?: unknown[]; msg?: string }) => {
          const field = Array.isArray(d.loc) ? String(d.loc[d.loc.length - 1]) : "";
          return field ? `${field.replace(/_/g, " ")}: ${d.msg}` : d.msg;
        })
        .join(" · ");
    }
  }
  return `Request failed (HTTP ${status})`;
}

export async function apiFetch<T>(baseUrl: string, path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form;
  }
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10000);
  let res: Response;
  try {
    res = await fetch(baseUrl + path, { method: opts.method ?? "GET", headers, body, signal: controller.signal });
  } catch {
    throw new ApiError(0, "This branch can't be reached right now.");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, res.status));
  return data as T;
}

export function photoUrl(baseUrl: string, hash: string | null): string | null {
  return hash ? `${baseUrl}/photos/${hash}` : null;
}
