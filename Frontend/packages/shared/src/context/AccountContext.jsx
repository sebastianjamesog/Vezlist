"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { ACCOUNT_ROLES, can as roleCan } from "../lib/accountRoles";

/**
 * One hook for "what may this account do".
 *
 * Role lives on the session (AuthContext owns identity); this context wraps it
 * with the capability check every screen actually asks — should this button
 * exist for this account.
 */
const AccountContext = createContext(null);

export function AccountProvider({ children }) {
  const { role, setRole, signedIn } = useAuth();

  const can = useCallback((capability) => roleCan(role, capability), [role]);

  const value = useMemo(
    () => ({
      role,
      roleMeta: ACCOUNT_ROLES[role],
      setRole,
      isCreator: role === "creator",
      signedIn,
      can,
    }),
    [role, setRole, signedIn, can],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside <AccountProvider>");
  return ctx;
}
