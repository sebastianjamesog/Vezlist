"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { usePersistedObject } from "../lib/persisted";
import { cookieStore } from "../lib/cookieStore";
import { DEFAULT_ROLE, SIGNUP_ROLE, normaliseRole } from "../lib/accountRoles";
import { isNonEmptyString, isObject } from "../lib/guards";
import { profile } from "../data/mock";

/**
 * The signed-in session.
 *
 * There is no backend, so "signing in" means the form validated and we recorded
 * who you said you were. Everything a real one would do — verifying the
 * password, issuing a token, expiring it — is the server's job and is missing.
 * What is real is the shape: one session the whole app reads, it survives a
 * reload, signing out clears it, and the account screens are gated on it.
 *
 * One account covers both sites — they are two faces of the same product, not
 * two products — so the session is a cookie on the parent domain rather than
 * localStorage, which is per-origin. Signing in on either site signs you in on
 * both, and signing out ends it on both. Saved items are still per-origin (see
 * README); they are a bigger payload than a cookie wants to carry.
 *
 * Crossing between the sites is a real navigation, so the other side reads the
 * cookie fresh on the way in. A tab left open on the site you did not sign out
 * of keeps its in-memory session until it is reloaded.
 */
const AuthContext = createContext(null);
// A cookie name is a token: no colon, which is what the localStorage keys use.
const KEY = "vezlist_session";

/**
 * A stored session worth signing in with, or `null`. `name` and `email` are
 * the two fields nothing downstream reads with a fallback — a session
 * missing either is not a session, it is a hand-edited cookie or a shape from
 * a build this one predates, and it falls back to signed-out the same way a
 * missing cookie does. `role` gets `normaliseRole`'s own fallback rather than
 * being a reason to drop the whole session, because that helper already
 * exists for exactly this ("a stored role that is no longer in the table
 * falls back rather than breaking a screen"). Every other field — `avatar`,
 * and whatever `updateProfile` has merged in from the account screens — is
 * left exactly as it arrived: this is not the place profile edits go missing.
 */
function normaliseSession(value) {
  if (
    !isObject(value) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.email)
  ) {
    return null;
  }
  return { ...value, role: normaliseRole(value.role) };
}

export function AuthProvider({ children }) {
  const [stored, setUser, ready, clear] = usePersistedObject(KEY, cookieStore);
  // The raw stored value is what `setUser` still writes over — `signIn`
  // always constructs a complete session, and `setRole`/`updateProfile` only
  // ever spread over what was already there — while `user`, the value every
  // consumer reads, is the normalised one. The same split `AccountContext`
  // already draws between `stored` and `normaliseWallet(stored)`.
  const user = useMemo(() => normaliseSession(stored), [stored]);

  const signIn = useCallback(
    ({ name, email, role }, mode = "signin") => {
      const next = {
        // Signing up takes the name you gave; signing in has nothing to go on
        // but the mock account, which is what the rest of the screens show.
        name: mode === "signup" ? name.trim() : profile.name,
        email: email.trim().toLowerCase(),
        avatar: profile.avatar,
        // Signing up hands us SIGNUP_ROLE — every account is an ads creator.
        // Signing in sends nothing and there is no server to ask, so it keeps
        // the role this browser last held; falling back to SIGNUP_ROLE rather
        // than DEFAULT_ROLE matters on a device that has never held a session,
        // where the browsing default would sign a seller in to an account with
        // no My Ads and no way to see why.
        role: normaliseRole(role ?? user?.role ?? SIGNUP_ROLE),
        signedInAt: "just now",
      };
      setUser(next);
      return next;
    },
    [setUser, user],
  );

  /**
   * Switching account type is a settings row, not a second signup: the two
   * roles are two ways to use one account, and someone who came to browse and
   * then decided to sell should not have to make another.
   */
  const setRole = useCallback(
    (role) => setUser((u) => (u ? { ...u, role: normaliseRole(role) } : u)),
    [setUser],
  );

  /**
   * Personal-details edits merge into the same session object `signIn` wrote,
   * rather than living in a second store. Every screen that shows profile
   * data — the hero here, the sidebar avatar — reads `user` off this context,
   * so this is the one place an edit has to land for all of them to see it.
   */
  const updateProfile = useCallback(
    (patch) => setUser((u) => (u ? { ...u, ...patch } : u)),
    [setUser],
  );

  const value = useMemo(
    () => ({
      user,
      ready,
      signedIn: Boolean(user),
      // A guest is browsing. Nothing gated on a creator capability is offered
      // to one, and the gate that matters (RequireAuth) is already in front.
      role: normaliseRole(user?.role ?? DEFAULT_ROLE),
      setRole,
      signIn,
      signOut: clear,
      updateProfile,
    }),
    [user, ready, setRole, signIn, clear, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
