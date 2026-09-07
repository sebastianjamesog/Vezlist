const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api/v1"
).replace(/\/$/, "");

let csrf = null;

export class ApiError extends Error {
  constructor(message, status, details = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function parse(response) {
  const type = response.headers.get("content-type") ?? "";
  return type.includes("application/json") ? response.json() : null;
}

async function csrfToken() {
  if (csrf) return csrf;
  const response = await fetch(`${API_BASE_URL}/auth/csrf`, { credentials: "include" });
  const data = await parse(response);
  if (!response.ok || !data?.token || !data?.headerName) {
    throw new ApiError("Could not prepare a secure request.", response.status);
  }
  csrf = data;
  return csrf;
}

export async function api(path, options = {}) {
  const method = (options.method ?? "GET").toUpperCase();
  const write = !["GET", "HEAD", "OPTIONS"].includes(method);
  const headers = new Headers(options.headers);
  if (write) {
    const token = await csrfToken();
    headers.set(token.headerName, token.token);
  }
  if (options.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    method,
    headers,
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 204) return null;
  const data = await parse(response);
  if (!response.ok) {
    throw new ApiError(data?.message ?? "Something went wrong. Please try again.", response.status, data?.details ?? []);
  }
  return data;
}

export function resetCsrfToken() {
  csrf = null;
}
