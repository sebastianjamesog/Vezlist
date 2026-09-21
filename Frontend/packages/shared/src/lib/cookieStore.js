import { MARKETPLACE_URL } from "./sites.js";

/**
 * A storage adapter shaped like localStorage's, backed by a cookie.
 *
 * The two sites are two faces of one account, and localStorage is per-origin —
 * a session written on the marketplace is invisible to personals, and logging
 * out of one leaves the other signed in. A cookie on the parent domain is read
 * by both subdomains, and cookies ignore the port, so the two dev servers share
 * one as well.
 *
 * There is no backend, so this is a record of who you said you were and not a
 * credential. A real session is an httpOnly cookie the browser cannot read at
 * all; this one has to be readable here because nothing on a server is issuing
 * it. Do not put anything secret in it.
 */

// vezlist.cc -> ".vezlist.cc", which personals.vezlist.cc also matches. A
// hostname with no dot (localhost) takes no domain attribute: it is already
// shared across ports, and browsers drop the cookie if you name it.
const host = new URL(MARKETPLACE_URL).hostname;
const DOMAIN = host.includes(".") ? `; domain=.${host}` : "";
const SECURE = MARKETPLACE_URL.startsWith("https:") ? "; secure" : "";
const MAX_AGE = 60 * 60 * 24 * 30;
const ATTRS = `; path=/; samesite=lax${DOMAIN}${SECURE}`;

/**
 * One cookie out of a `document.cookie` string. Split on the pair separator
 * rather than searching the whole string: a name is only a name at the start
 * of a pair, or `session` would match `other_session`.
 *
 * `document.cookie` is exactly as hand-editable as localStorage — more so,
 * since a browser's own dev tools offer a cookie editor with no JSON
 * validation at all — and a value that is not a legal percent-encoding
 * (a lone `%`, `%zz`) makes `decodeURIComponent` throw. That has to read as
 * "no value", not as an exception three layers up inside a context provider,
 * so it is caught here rather than left to whichever caller happens to wrap
 * `getItem` in a `try` (`usePersisted` does, but nothing requires that of
 * every caller this ever gets).
 */
export function readCookie(raw, key) {
  const hit = (raw ?? "")
    .split("; ")
    .find((pair) => pair.startsWith(`${key}=`));
  if (!hit) return null;
  try {
    return decodeURIComponent(hit.slice(key.length + 1));
  } catch {
    return null;
  }
}

export const cookieStore = {
  getItem(key) {
    return readCookie(document.cookie, key);
  },
  setItem(key, value) {
    document.cookie = `${key}=${encodeURIComponent(value)}; max-age=${MAX_AGE}${ATTRS}`;
  },
  removeItem(key) {
    document.cookie = `${key}=; max-age=0${ATTRS}`;
  },
};
