"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { can } from "../lib/adminRoles";
import * as authApi from "../lib/api/auth";

/**
 * The console uses /api/v1/admin/auth and its own server session cookie.
 * Public Marketplace/Personals logins and logouts cannot replace this session.
 * Backend roles still authorize every staff request; the mapping here controls
 * UI visibility only. No session token or credentials are stored in JS storage.
 */
const AdminAuthContext = createContext(null);

/** Backend security role -> this console's own role concept. */
function mapConsoleRole(roles) {
  if (!roles) return null;
  if (roles.includes("ADMIN")) return "owner";
  if (roles.includes("MODERATOR")) return "moderator";
  // A plain USER (or any role this console has no tier for) gets none — see
  // module doc. There is no backend equivalent of the console's own
  // mock-only "support" tier, so that tier is simply unreachable here.
  return null;
}

function mapAdmin(response) {
  const role = mapConsoleRole(response?.roles);
  if (!role) return null;
  return {
    id: response.id,
    name: response.name,
    email: response.email,
    role,
  };
}

/**
 * Thrown by `signIn` when the credentials were valid but the account has no
 * console role. Distinct from `ApiError` (a 401 from bad credentials) so
 * `AdminLogin` can tell the two apart and word the message accordingly.
 */
export class ConsoleAccessError extends Error {}

export function AdminAuthProvider({ children }) {
  const request = useRef(0);
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const version = ++request.current;
    try {
      const response = await authApi.me();
      if (version === request.current) setAdmin(mapAdmin(response));
    } catch {
      if (version === request.current) setAdmin(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const signIn = useCallback(async ({ email, password }) => {
    request.current++;
    // Throws ApiError({status:401,...}) on a wrong email/password — that
    // propagates to the caller unchanged, same as the public `AuthContext`.
    let response;
    try {
      response = await authApi.login({ email, password });
    } catch (error) {
      if (error?.status === 403 && error?.code === "CONSOLE_ACCESS_DENIED") {
        throw new ConsoleAccessError(
          "This account doesn't have console access. Ask an owner to grant it the Moderator or Admin role.",
        );
      }
      throw error;
    }
    const role = mapConsoleRole(response.roles);
    if (!role) {
      // A real account, correctly authenticated, just not one this console
      // admits. Leaving that session open would let a USER account sit
      // signed in on a screen with nothing for it to see, so it's dropped
      // immediately rather than left for the next /me to discover.
      await authApi.logout().catch(() => {});
      setAdmin(null);
      throw new ConsoleAccessError(
        "This account doesn't have console access. Ask an owner to grant it the Moderator or Admin role.",
      );
    }
    const next = {
      id: response.id,
      name: response.name,
      email: response.email,
      role,
    };
    setAdmin(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    request.current++;
    await authApi.logout();
    setAdmin(null);
  }, []);

  const value = useMemo(
    () => ({
      admin,
      ready,
      signedIn: Boolean(admin),
      signIn,
      signOut,
      role: admin?.role ?? null,
      /**
       * What this session may do. Screens ask before rendering a control; the
       * reducer asks again before honouring the action, because a hidden
       * button is not an access check.
       */
      can: (permission) => can(admin?.role, permission),
    }),
    [admin, ready, signIn, signOut],
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used inside <AdminAuthProvider>");
  }
  return ctx;
}
