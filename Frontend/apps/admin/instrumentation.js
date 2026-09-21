import { reportError } from "@vezlist/shared/lib/observability.js";

/**
 * The server half of #20.
 *
 * `app/error.jsx` and `app/global-error.jsx` are Client Components — they only
 * ever see errors that reach the browser, and Next replaces a server error's
 * message with an opaque digest before it gets there. So a server-side throw
 * is invisible to them by design. `onRequestError` is Next's own hook for
 * exactly that case: it runs inside the Worker, with the real error and the
 * route that produced it, and it is where a stack trace still exists.
 *
 * `routerKind`/`routePath` are what make the report actionable — "/ad/[id]"
 * rather than the one id that happened to break — and the digest is what ties
 * this entry to whatever the user's boundary reported from the other side.
 */
export async function onRequestError(error, request, context) {
  reportError(error, {
    scope: "server",
    route: context?.routePath ?? request?.path,
    routerKind: context?.routerKind,
    routeType: context?.routeType,
    renderSource: context?.renderSource,
    method: request?.method,
    path: request?.path,
  });
}
