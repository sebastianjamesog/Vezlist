/**
 * Error reporting, in about sixty lines and no dependencies.
 *
 * ── Why not `@sentry/nextjs` ──────────────────────────────────────────────
 *
 * Sentry does support Next on Cloudflare Workers — there is a first-party
 * guide for it (docs.sentry.io › javascript › guides › cloudflare › frameworks
 * › nextjs) and it is the right answer for an app with a backend. It is not
 * the right answer for this one yet, for three reasons that are about this
 * repo rather than about Sentry:
 *
 *   1. The SDK is a large dependency (the server half pulls OpenTelemetry) in
 *      a repo that has six runtime dependencies on purpose, and it lands
 *      inside a Worker bundle that already carries a whole Next server.
 *   2. Its value over this file is source-mapped stack frames, breadcrumbs and
 *      tracing — all of which need a build-time upload step, an auth token and
 *      a `withSentryConfig` wrapper around three `next.config.mjs` files. None
 *      of that can be verified without an account, and shipping an unverified
 *      wrapper around the OpenNext build is exactly the risk the issue warns
 *      about.
 *   3. What the issue actually asks for is "an uncaught error in production
 *      produces an alert with stack and route". A DSN is a public URL and the
 *      envelope endpoint is a plain HTTPS POST; that requirement is met by
 *      this file, today, with nothing added to `package.json`.
 *
 * So this is the transport and not the SDK. When there is a server worth
 * tracing, swap it: set the same DSN in `@sentry/nextjs`, delete this, and the
 * six boundaries keep the same one-line call.
 *
 * ── Why three copies ──────────────────────────────────────────────────────
 *
 * `apps/marketplace`, `apps/personals` and `apps/admin` each hold a
 * byte-identical copy of this file (`diff` them; they are not allowed to
 * drift). The shared package is where it would belong, but a module in
 * `packages/shared` is a module every screen can import, and this one has
 * exactly six callers, all of them app-level error boundaries. It is
 * deployment plumbing rather than product code, and it stays beside the
 * deployment.
 *
 * ── What it does when nothing is configured ───────────────────────────────
 *
 * Logs one structured line and returns. That line is not a placeholder: on
 * Cloudflare, an uncaught error and anything written to the console inside a
 * Worker both land in Workers Logs, so the *server* half of this is already
 * being collected before a DSN exists. The DSN is what adds the client half,
 * which never reaches the Worker at all.
 */

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
const ENVIRONMENT =
  process.env.NEXT_PUBLIC_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";
const RELEASE = process.env.NEXT_PUBLIC_RELEASE ?? undefined;
const SITE = process.env.NEXT_PUBLIC_SITE ?? "marketplace";

/**
 * Pull the ingest URL and the public key out of a DSN.
 *
 * A DSN is `https://<publicKey>@<host>/<projectId>` — a public value, safe in
 * a client bundle, which is the whole reason this works without a server. A
 * malformed one returns `null` rather than throwing: a bad environment
 * variable must not be able to turn an error boundary into a second error.
 */
export function parseDsn(dsn) {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    if (!url.username || !projectId) return null;
    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/?sentry_key=${url.username}&sentry_version=7`,
      publicKey: url.username,
      projectId,
    };
  } catch {
    return null;
  }
}

/** 32 hex characters, which is the id format the ingest endpoint expects. */
function eventId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * One Sentry event.
 *
 * The stack goes in `extra` rather than in `exception.stacktrace.frames`:
 * frames have to be parsed per engine and then symbolicated against an
 * uploaded source map, and a wrong guess at a frame is worse than the raw
 * string. Sentry renders `extra` verbatim, so the stack is readable in the
 * issue either way — it is just not clickable.
 *
 * `digest` is the field that makes a client-side report worth having. Next
 * replaces a server error's message with an opaque digest before it reaches
 * the browser, and prints that same digest in the server log; carrying it here
 * is what lets a support ticket about a broken page be matched to the Worker
 * log line that explains it.
 */
export function buildEvent(error, context = {}) {
  const { route, scope = "unknown", ...extra } = context;
  const err = error instanceof Error ? error : new Error(String(error));

  return {
    event_id: eventId(),
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    environment: ENVIRONMENT,
    release: RELEASE,
    logger: scope,
    transaction: route,
    tags: { site: SITE, scope, digest: err.digest },
    exception: {
      values: [
        {
          type: err.name || "Error",
          value: err.message || String(err),
          mechanism: { type: scope, handled: true },
        },
      ],
    },
    extra: { ...extra, stack: err.stack ?? null, digest: err.digest ?? null },
  };
}

/** The three newline-delimited JSON lines an envelope is made of. */
export function buildEnvelope(event) {
  return [
    JSON.stringify({
      event_id: event.event_id,
      sent_at: new Date().toISOString(),
    }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
}

/** Where the boundary is reporting from, for the log line and the tag. */
function currentRoute(route) {
  if (route) return route;
  if (typeof location === "undefined") return undefined;
  return location.pathname + location.search;
}

/**
 * Report an uncaught error. Never throws, never returns a rejected promise —
 * a failed report must not become the error the user sees.
 */
export function reportError(error, context = {}) {
  const route = currentRoute(context.route);
  const event = buildEvent(error, { ...context, route });

  // Always. On the Worker this is what Cloudflare's Workers Logs collect; in
  // the browser it is what a developer with the console open reads.
  console.error(
    `[${SITE}] ${event.logger} error on ${route ?? "unknown route"}`,
    error,
  );

  const dsn = parseDsn(DSN);
  if (!dsn) return;

  const body = buildEnvelope(event);
  try {
    // `sendBeacon` survives the page being torn down, which a `global-error`
    // frequently is. `keepalive` is the same guarantee for the fetch path.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(dsn.endpoint, body);
      return;
    }
    fetch(dsn.endpoint, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-sentry-envelope" },
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Blocked by an extension, offline, quota — none of it is worth a second
    // error on a screen that is already apologising for the first.
  }
}
