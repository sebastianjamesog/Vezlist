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
 * The backend's default Spring Security CSRF handler
 * (XorCsrfTokenRequestAttributeHandler) BREACH-masks the token it exposes to
 * request attributes/controllers, which is a *different* string from the
 * unmasked value CookieCsrfTokenRepository writes into the XSRF-TOKEN
 * cookie. Only the masked value — GET /api/v1/auth/csrf's JSON body — can be
 * unmasked back to the real token by the header check; the raw cookie value
 * fails validation. So this reads the CSRF endpoint's body, not the cookie.
 *
 * The masked value stays valid for the life of the underlying token (the
 * server re-derives the same raw token from any masked string it ever
 * handed out), so caching it in memory for the tab's lifetime is safe; a
 * 403 from a stale cache (e.g. session changed) clears it and retries once.
 */
let csrfTokenPromise = null;

function fetchCsrfToken() {
  return fetch(`${API_BASE_URL}/api/v1/auth/csrf`, { credentials: "include" })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => body?.token ?? null);
}

/**
 * Spring rotates the CSRF cookie on session-authentication changes (login,
 * register, logout), so a cached masked token from before the call is
 * stale afterward. Callers around auth mutations should invalidate the
 * cache proactively rather than rely solely on the 403-retry.
 */
export function resetCsrfToken() {
  csrfTokenPromise = null;
}

async function ensureCsrfToken() {
  if (!csrfTokenPromise) csrfTokenPromise = fetchCsrfToken();
  return csrfTokenPromise;
}

/**
 * Low-level fetch wrapper: same-origin session cookie + CSRF handling,
 * JSON in/out, and errors normalized to ApiError so callers can branch on
 * `.status`/`.code` instead of re-parsing response bodies.
 */
export async function apiFetch(path, { method = "GET", body, headers, signal } = {}, retrying = false) {
  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }

  if (MUTATING_METHODS.has(method)) {
    const token = await ensureCsrfToken();
    if (token) finalHeaders.set("X-XSRF-TOKEN", token);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (response.status === 403 && MUTATING_METHODS.has(method) && !retrying) {
    resetCsrfToken();
    return apiFetch(path, { method, body, headers, signal }, true);
  }

  if (response.status === 204) return null;

  const isJson = (response.headers.get("Content-Type") || "").includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

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
  get: (path, query) => apiFetch(withQuery(path, query)),
  post: (path, body, opts) => apiFetch(path, { ...opts, method: "POST", body }),
  put: (path, body, opts) => apiFetch(path, { ...opts, method: "PUT", body }),
  patch: (path, body, opts) => apiFetch(path, { ...opts, method: "PATCH", body }),
  delete: (path, query) => apiFetch(withQuery(path, query), { method: "DELETE" }),
};
