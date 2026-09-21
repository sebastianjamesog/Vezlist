/**
 * Where a login screen is allowed to send you afterwards.
 *
 * Both sign-in screens read a `next=` query param and hand it to the router.
 * A relative path — one that starts with a single "/" — stays inside this app;
 * anything else is an offsite redirect, which on a login page is a phishing
 * primitive: the link looks like ours, the credentials go somewhere else.
 *
 * Two shapes have to be refused, not one. "https://evil.example" is the
 * obvious case. "//evil.example" is the one that gets missed — a browser
 * resolves a protocol-relative URL against whatever scheme the page loaded
 * on, so it is just as offsite as the first while still starting with "/".
 *
 * Plain module, no React and no Next imports, so it loads under `node --test`
 * as-is. That is the point of it living here rather than in nav.jsx.
 */
export function safeNext(next, fallback = "/") {
  return typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//")
    ? next
    : fallback;
}
