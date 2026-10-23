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
import * as authApi from "../lib/api/auth";

const AuthContext = createContext(null);

function mapUser(response) {
  if (!response) return null;
  return {
    id: response.id,
    name: response.name,
    email: response.email,
    emailVerified: response.emailVerified,
    roles: response.roles ?? [],
    accountType: response.accountType ?? "CREATOR",
  };
}

/** Session identity and creator permissions are persisted by the backend. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const revision = useRef(0);
  const refreshUser = useCallback(async () => {
    const currentRevision = ++revision.current;
    try {
      const response = await authApi.me();
      if (revision.current === currentRevision) setUser(mapUser(response));
      return response;
    } catch (error) {
      if (revision.current === currentRevision && (error?.status === 401 || error?.status === 403)) setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setReady(true));
  }, [refreshUser]);

  const signIn = useCallback(async (payload, mode = "signin") => {
    ++revision.current;
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
    return response;
  }, []);

  const setRole = useCallback(async (role) => {
    if (role !== "creator" && role !== "user")
      throw new Error("Invalid account type.");
    const response = await authApi.changeAccountType(
      role === "creator" ? "CREATOR" : "BROWSING",
    );
    setUser((current) =>
      current?.id === response.id ? mapUser(response) : current,
    );
    return response;
  }, []);

  const signOut = useCallback(async () => {
    await authApi.logout();
    ++revision.current;
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    (patch) =>
      setUser((current) => (current ? { ...current, ...patch } : current)),
    [],
  );
  const value = useMemo(
    () => ({
      user,
      ready,
      signedIn: Boolean(user),
      role: user?.accountType === "CREATOR" ? "creator" : "user",
      setRole,
      signIn,
      signOut,
      updateProfile,
      refreshUser,
    }),
    [user, ready, setRole, signIn, signOut, updateProfile, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
