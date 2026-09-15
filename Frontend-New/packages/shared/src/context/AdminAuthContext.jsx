"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { usePersistedObject } from "../lib/persisted";
import { ROLES, can } from "../lib/adminRoles";
import { isNonEmptyString, isObject } from "../lib/guards";
import { adminUsers } from "../data/mock";

/**
 * The console's session.
 *
 * A mirror of AuthContext with one deliberate difference: this one uses
 * `usePersistedObject`'s default localStorage store rather than the shared
 * cookie. localStorage is per-origin, and the console is a third origin — so
 * per-origin isolation comes for free, and a shopper signed in on either
 * public site cannot arrive here already admitted. That is the property worth
 * having, and it is the one property this fake session actually delivers.
 *
 * Same honesty as the public one: the shape is real, the server is not. There
 * is nothing checking the password, so do not put this in front of anything
 * that matters until there is.
 */
const AdminAuthContext = createContext(null);

const KEY = "vezlist:admin:session:v1";

/**
 * A stored admin session worth treating as signed in, or `null`. `id`,
 * `name` and `email` are read with no fallback wherever this context's value
 * is used, and `role` is checked against the roster this console actually
 * has (`ROLES`, from `adminRoles.js`) rather than left to whatever a
 * hand-edited `localStorage` value claims — an admin session with a role
 * this console does not recognise is worth no more than one with no role at
 * all, and both fall back to signed out rather than to a session `can()`
 * would silently refuse everything for anyway.
 */
function normaliseAdminSession(value) {
  if (
    !isObject(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.email) ||
    !ROLES[value.role]
  ) {
    return null;
  }
  return value;
}

export function AdminAuthProvider({ children }) {
  const [stored, setAdmin, ready, clear] = usePersistedObject(KEY);
  // `stored` is what `signIn` still writes over; `admin`, the value every
  // consumer reads, is the normalised one — the same split `AuthContext`
  // draws between its raw session and `normaliseSession(stored)`.
  const admin = useMemo(() => normaliseAdminSession(stored), [stored]);

  const signIn = useCallback(
    ({ email }) => {
      const address = email.trim().toLowerCase();
      // Whichever seeded moderator matches the address, else the first one —
      // the audit log needs a name, and "Unknown" is not one.
      const match =
        adminUsers.find((a) => a.email === address) ?? adminUsers[0];
      const next = { ...match, email: address, signedInAt: "just now" };
      setAdmin(next);
      return next;
    },
    [setAdmin],
  );

  const value = useMemo(
    () => ({
      admin,
      ready,
      signedIn: Boolean(admin),
      signIn,
      signOut: clear,
      // Who *could* sign in. The sign-in screen lists them, and this context
      // already owns the roster — so the screen does not have to reach past it
      // into `mock.js` for a demo credential list.
      roster: adminUsers,
      role: admin?.role ?? null,
      /**
       * What this session may do. Screens ask before rendering a control; the
       * reducer asks again before honouring the action, because a hidden
       * button is not an access check.
       */
      can: (permission) => can(admin?.role, permission),
    }),
    [admin, ready, signIn, clear],
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
