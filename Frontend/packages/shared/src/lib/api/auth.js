import { api, resetCsrfToken } from "./client.js";

/** POST /api/v1/auth/register -> CurrentUserResponse. Also starts the session. */
export async function register({ name, email, password, acceptedTerms }) {
  const user = await api.post("/api/v1/auth/register", { name, email, password, acceptedTerms });
  resetCsrfToken();
  return user;
}

/** POST /api/v1/auth/login -> CurrentUserResponse. */
export async function login({ email, password }) {
  const user = await api.post("/api/v1/auth/login", { email, password });
  resetCsrfToken();
  return user;
}

/** GET /api/v1/auth/me -> CurrentUserResponse. 401 (ApiError) when not signed in. */
export function me() {
  return api.get("/api/v1/auth/me");
}

/** POST /api/v1/auth/logout -> 204. */
export async function logout() {
  await api.post("/api/v1/auth/logout");
  resetCsrfToken();
}
