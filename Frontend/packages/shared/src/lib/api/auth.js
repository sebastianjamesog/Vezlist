import { api, resetCsrfToken } from "./client.js";
import { IS_ADMIN } from "../sites.js";

const AUTH_PATH = IS_ADMIN ? "/api/v1/admin/auth" : "/api/v1/auth";

/** POST /api/v1/auth/register -> CurrentUserResponse. Also starts the session. */
export async function register({ name, email, password, acceptedTerms }) {
  const user = await api.post("/api/v1/auth/register", {
    name,
    email,
    password,
    acceptedTerms,
  });
  resetCsrfToken("/api/v1/auth/register");
  return user;
}

/** POST /api/v1/auth/login -> CurrentUserResponse. */
export async function login({ email, password }) {
  const user = await api.post(`${AUTH_PATH}/login`, { email, password });
  resetCsrfToken(AUTH_PATH);
  return user;
}

/** GET /api/v1/auth/me -> CurrentUserResponse. 401 (ApiError) when not signed in. */
export function me() {
  return api.get(`${AUTH_PATH}/me`);
}

export function changeAccountType(accountType) {
  return api.patch("/api/v1/auth/account-type", { accountType });
}

/** POST /api/v1/auth/logout -> 204. */
export async function logout() {
  await api.post(`${AUTH_PATH}/logout`);
  resetCsrfToken(AUTH_PATH);
}
