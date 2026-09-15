const DEFAULT_API_BASE_URL = "http://localhost:8080/api/v1";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL
).replace(/\/$/, "");

let csrf = null;
let pendingCsrf = null;

export class ApiError extends Error {
  constructor(message, status, details = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function parse(response) {
  if (response.status === 204) return null;
  const type = response.headers.get("content-type") ?? "";
  return type.includes("application/json") ? response.json() : null;
}

async function csrfToken() {
  if (csrf) return csrf;
  if (pendingCsrf) return pendingCsrf;

  pendingCsrf = fetch(`${API_BASE_URL}/auth/csrf`, {
    credentials: "include",
  })
    .then(async (response) => {
      const data = await parse(response);
      if (!response.ok || !data?.token || !data?.headerName) {
        throw new ApiError(
          "Could not prepare a secure request.",
          response.status,
        );
      }
      csrf = data;
      return data;
    })
    .finally(() => {
      pendingCsrf = null;
    });

  return pendingCsrf;
}

function bodyForRequest(body, headers) {
  if (body == null) return undefined;
  if (body instanceof FormData || typeof body === "string") return body;
  headers.set("Content-Type", "application/json");
  return JSON.stringify(body);
}

export async function api(path, options = {}) {
  if (!path.startsWith("/")) {
    throw new TypeError("API paths must start with '/'.");
  }

  const method = (options.method ?? "GET").toUpperCase();
  const write = !["GET", "HEAD", "OPTIONS"].includes(method);
  const headers = new Headers(options.headers);

  if (write) {
    const token = await csrfToken();
    headers.set(token.headerName, token.token);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    method,
    headers,
    credentials: "include",
    body: bodyForRequest(options.body, headers),
  });
  const data = await parse(response);

  if (!response.ok) {
    if (response.status === 403) csrf = null;
    throw new ApiError(
      data?.message ?? "Something went wrong. Please try again.",
      response.status,
      data?.details ?? [],
    );
  }

  return data;
}

export function resetApiSecurityState() {
  csrf = null;
  pendingCsrf = null;
}
