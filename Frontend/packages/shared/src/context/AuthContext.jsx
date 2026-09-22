"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePersisted } from "../lib/persisted";
import { cookieStore } from "../lib/cookieStore";
import { DEFAULT_ROLE, SIGNUP_ROLE, normaliseRole } from "../lib/accountRoles";
import * as authApi from "../lib/api/auth";

/**
 * The signed-in session, backed by the real cc.vezlist API.
 *
 * Identity (name/email/roles) lives on the server now: the session is a
 * Spring Session cookie the browser can't read, so this context hydrates
 * from GET /api/v1/auth/me on mount and after login/register, rather than
 * reading anything out of storage itself.
 *
 * The creator/browsing account-type toggle has no backend counterpart — it's
 * a client-side preference, not an identity claim — so it stays in the
 * shared cookie the two sites already used for the old mock session, under
 * its own key. That's the only thing this context still persists itself.
 */
const AuthContext = createContext(null);
const ROLE_KEY = "vezlist_role";

function decodeRole(raw) {
  try {
    const value = JSON.parse(raw);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function mapUser(response) {
  if (!response) return null;
  return {
    id: response.id,
    name: response.name,
    email: response.email,
    emailVerified: response.emailVerified,
    roles: response.roles ?? [],
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [storedRole, setStoredRole, roleReady] = usePersisted(
    ROLE_KEY,
    null,
    decodeRole,
    cookieStore,
  );

  const refreshUser = useCallback(async () => {
    try {
      const response = await authApi.me();
      setUser(mapUser(response));
      return response;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setSessionReady(true));
  }, [refreshUser]);

  const signIn = useCallback(
    async (payload, mode = "signin") => {
      const response =
        mode === "signup"
          ? await authApi.register({
              name: payload.name.trim(),
              email: payload.email.trim().toLowerCase(),
              password: payload.password,
              acceptedTerms: Boolean(payload.accepted),
            })
          : await authApi.login({
              email: payload.email.trim().toLowerCase(),
              password: payload.password,
            });
      setUser(mapUser(response));
      setStoredRole(normaliseRole(payload.role ?? (mode === "signup" ? SIGNUP_ROLE : storedRole)));
      return response;
    },
    [setStoredRole, storedRole],
  );

  const setRole = useCallback(
    (role) => setStoredRole(normaliseRole(role)),
    [setStoredRole],
  );

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setStoredRole(null);
    }
  }, [setStoredRole]);

  /**
   * Optimistic local patch for the few fields a caller already knows the new
   * value of (e.g. right after a successful profile PATCH) — a display-only
   * merge, never the write itself. Callers that mutate server state go
   * through packages/shared/src/lib/api/users.js and then either pass the
   * confirmed fields here or call refreshUser().
   */
  const updateProfile = useCallback(
    (patch) => setUser((u) => (u ? { ...u, ...patch } : u)),
    [],
  );

  const ready = sessionReady && roleReady;

  const value = useMemo(
    () => ({
      user,
      ready,
      signedIn: Boolean(user),
      role: normaliseRole(storedRole ?? DEFAULT_ROLE),
      setRole,
      signIn,
      signOut,
      updateProfile,
      refreshUser,
    }),
    [user, ready, storedRole, setRole, signIn, signOut, updateProfile, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
