"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, resetCsrfToken } from "../lib/api";

const AuthContext = createContext(null);

/** The Spring Boot API owns the session in an HttpOnly cookie. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refreshSession = useCallback(async () => {
    try {
      const current = await api("/auth/me");
      setUser(current);
      return current;
    } catch (error) {
      if (![401, 403].includes(error.status)) throw error;
      setUser(null);
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refreshSession().catch(() => setUser(null));
  }, [refreshSession]);

  const signIn = useCallback(async ({ name, email, password, accepted }, mode = "signin") => {
    const current = mode === "signup"
      ? await api("/auth/register", {
          method: "POST",
          body: { name, email, password, acceptedTerms: accepted },
        })
      : await api("/auth/login", { method: "POST", body: { email, password } });
    setUser(current);
    return current;
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (error) {
      // A missing/expired session is already the desired signed-out state.
      if (![401, 403].includes(error.status)) throw error;
    } finally {
      resetCsrfToken();
    }
  }, []);

  const value = useMemo(
    () => ({ user, ready, signedIn: Boolean(user), signIn, signOut, refreshSession }),
    [user, ready, signIn, signOut, refreshSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
