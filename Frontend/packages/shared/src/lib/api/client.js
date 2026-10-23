import { IS_PERSONALS } from "../sites.js";

/**
 * Overridable per build with NEXT_PUBLIC_API_URL. Dev default matches
 * Backend/.env.example's server port (8080); there is no production API
 * origin yet (Backend/plan.md §14 leaves that decision open), so a
 * production build with no env var set will fail loudly instead of
 * silently calling localhost.
 */
const dev = process.env.NODE_ENV !== "production";
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? (dev ? "http://localhost:8080" : "");

/** The SiteScope enum value (cc.vezlist.shared.domain.SiteScope) for this build. */
export const SITE_SCOPE = IS_PERSONALS ? "PERSONALS" : "MARKETPLACE";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class ApiError extends Error {
  constructor({ status, code, message, details, traceId }) {
    super(message || `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.traceId = traceId;
  }
}

/**
 * Read the BREACH-masked token returned by the API, never the raw cookie.
 * Admin and public requests have independent cookies and token caches, even
 * when both kinds of request originate in the same frontend bundle.
 */
const csrfTokenPromises = new Map();

function csrfPathFor(path) {
  return /^\/api\/v1\/(admin|moderation)(?:\/|\?|$)/.test(path) ||
    /^\/api\/v1\/support\/articles\/admin(?:\/|\?|$)/.test(path)
    ? "/api/v1/admin/auth/csrf"
    : "/api/v1/auth/csrf";
}

async function fetchCsrfToken(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.token) {
    throw new ApiError({
      status: response.status,
      code: body?.code,
      message:
        body?.message ||
        "Could not prepare a secure request. Please try again.",
    });
  }
  return body.token;
}

/** Invalidate only the affected session's token, or both when no path is given. */
export function resetCsrfToken(path) {
  if (path) csrfTokenPromises.delete(csrfPathFor(path));
  else csrfTokenPromises.clear();
}

function ensureCsrfToken(path) {
  const csrfPath = csrfPathFor(path);
  if (!csrfTokenPromises.has(csrfPath)) {
    const pending = fetchCsrfToken(csrfPath).catch((error) => {
      // A failed token fetch must not permanently poison this tab's cache.
      if (csrfTokenPromises.get(csrfPath) === pending)
        csrfTokenPromises.delete(csrfPath);
      throw error;
    });
    csrfTokenPromises.set(csrfPath, pending);
  }
  return csrfTokenPromises.get(csrfPath);
}

/**
 * Low-level fetch wrapper: same-origin session cookie + CSRF handling,
 * JSON in/out, and errors normalized to ApiError so callers can branch on
 * `.status`/`.code` instead of re-parsing response bodies.
 */
export async function apiFetch(
  path,
  { method = "GET", body, headers, signal, cache } = {},
  retrying = false,
) {
  method = method.toUpperCase();
  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }

  if (MUTATING_METHODS.has(method)) {
    const token = await ensureCsrfToken(path);
    if (token) finalHeaders.set("X-XSRF-TOKEN", token);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    ...(cache ? { cache } : {}),
  });

  if (response.status === 204) return null;

  const isJson = (response.headers.get("Content-Type") || "").includes(
    "application/json",
  );
  const payload = isJson ? await response.json().catch(() => null) : null;

  // Authorization failures must never repeat a mutation. Only the CSRF
  // filter's explicit rejection guarantees it did not reach the controller.
  if (
    response.status === 403 &&
    payload?.code === "CSRF_INVALID" &&
    MUTATING_METHODS.has(method) &&
    !retrying
  ) {
    resetCsrfToken(path);
    return apiFetch(path, { method, body, headers, signal, cache }, true);
  }

  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: payload?.code,
      message: payload?.message,
      details: payload?.details,
      traceId: payload?.traceId,
    });
  }

  return payload;
}

function withQuery(path, query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const api = {
  get: (path, query, opts) => apiFetch(withQuery(path, query), opts),
  post: (path, body, opts) => apiFetch(path, { ...opts, method: "POST", body }),
  put: (path, body, opts) => apiFetch(path, { ...opts, method: "PUT", body }),
  patch: (path, body, opts) =>
    apiFetch(path, { ...opts, method: "PATCH", body }),
  delete: (path, query) =>
    apiFetch(withQuery(path, query), { method: "DELETE" }),
};
