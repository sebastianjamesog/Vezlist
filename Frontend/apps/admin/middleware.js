import { NextResponse } from "next/server";

/**
 * Security response headers, applied to every response the Worker serves.
 *
 * Mechanism note: this repo deploys via @opennextjs/cloudflare, which bundles
 * the whole Next server — including Next middleware — into one Cloudflare
 * Worker (see the adapter's generated worker.ts: it runs the middleware
 * handler before falling through to the App Router server function). Next.js
 * middleware is therefore the mechanism that actually runs on this adapter, so
 * that's what sets these headers rather than `headers()` in next.config.mjs.
 * `headers()` is a static, build-time route-manifest match and would likely
 * also work here since OpenNext runs the real Next server, but middleware is
 * the officially-documented, exercised-by-the-adapter's-own-tests path for
 * per-request response mutation (see the adapter's examples/middleware), so it
 * is the safer bet.
 *
 * Next 16 deprecates this file in favour of `proxy.js`, but `proxy` requires
 * the Node.js runtime, which the adapter's own examples do not yet exercise
 * on Workers — `middleware.js` (edge runtime) is what the adapter's
 * middleware example and worker template actually run today, so that's what
 * is used here.
 *
 * CSP note: no per-request nonce. Next's official strict-CSP guide nonces
 * `script-src`/`style-src`, but that requires every page to opt out of static
 * rendering (`connection()`) because the nonce has to be baked into the HTML
 * at request time — which would defeat this app's R2-backed ISR/SSG (see
 * open-next.config.ts). App Router also always ships its RSC hydration
 * payload as inline `self.__next_f.push(...)` `<script>` tags regardless of
 * nonce use, so `script-src` needs either a nonce or 'unsafe-inline' — this
 * config takes 'unsafe-inline' to keep static rendering intact. `style-src`
 * needs it too: this console borrows the same @vezlist/shared components as
 * the two boards, including MapView.jsx, which renders its marker stylesheet
 * via a literal `<style>` tag (MARKER_CSS in map/icons.js) that isn't
 * nonce-able without wiring a nonce through every client component that
 * touches it. frame-ancestors and every other directive are unaffected by
 * this trade-off.
 */
/**
 * `next dev` only. React uses `eval()` in development to rebuild a callstack
 * that crossed the server/client boundary, and Turbopack evaluates modules the
 * same way; without it the app still runs but every page logs a console error
 * and the dev overlay loses its stacks. A production build uses neither, so
 * granting it there would widen the policy for nothing.
 *
 * This directive was verified against `wrangler dev` when it was written — a
 * production build, where React uses no eval — which is exactly why dev mode
 * was never exercised and the error reached someone running the app.
 */
const DEV = process.env.NODE_ENV === "development";

/**
 * The backend API origin — same resolution `lib/api/client.js`'s
 * `API_BASE_URL` uses, kept in sync deliberately rather than imported,
 * since this file runs in the Edge runtime and the shared package isn't
 * guaranteed importable from it. `connect-src 'self'` alone silently
 * blocked every `fetch` this app makes to the backend: CSP treats
 * `localhost:8080` as a different origin than `localhost:3002` even
 * though they're the same machine, and unlike CORS, a CSP violation never
 * reaches the network layer at all — no request, no CORS error, just a
 * browser-console-only "Refused to connect" that curl-based testing can
 * never reproduce (curl doesn't enforce CSP).
 */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? (DEV ? "http://localhost:8080" : "");

/**
 * The object storage origin — `lib/api/adminVerification.js`'s photo
 * review fetches a presigned MinIO download URL (`VEZLIST_STORAGE_ENDPOINT`
 * in dev), a third origin distinct from both this app and the API. Same
 * CSP gap as API_ORIGIN above; caught in the same real-browser test that
 * found it.
 */
const STORAGE_ORIGIN = process.env.NEXT_PUBLIC_STORAGE_URL ?? (DEV ? "http://localhost:9000" : "");

function securityHeaders() {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // 'unsafe-inline' is required for Next's inline RSC hydration scripts
    // (self.__next_f.push(...)) and, for style, MapView's inline marker
    // stylesheet — see the note above.
    `script-src 'self' 'unsafe-inline'${DEV ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // picsum.photos redirects to fastly.picsum.photos for the actual bytes
    // (moderation screens show ad/listing photos); basemaps.cartocdn.com is
    // Leaflet's OSM/CARTO tile source (a/b/c/d subdomains), kept for parity
    // with the shared MapView component. blob: covers local file-preview and
    // CSV-export object URLs (lib/csv.js).
    // STORAGE_ORIGIN: real listing/verification photos render as plain
    // <img src> pointing straight at object storage (next.config.mjs sets
    // `images.unoptimized: true`, so there's no same-origin optimizer proxy
    // to hide behind) — without it every real uploaded photo is a browser-
    // blocked image, indistinguishable from a broken URL.
    `img-src 'self' data: blob: https://picsum.photos https://*.picsum.photos https://*.basemaps.cartocdn.com${STORAGE_ORIGIN ? ` ${STORAGE_ORIGIN}` : ""}`,
    "font-src 'self' data:",
    `connect-src 'self'${API_ORIGIN ? ` ${API_ORIGIN}` : ""}${STORAGE_ORIGIN ? ` ${STORAGE_ORIGIN}` : ""}`,
    "form-action 'self'",
    // No third-party origin may frame the moderation console. Same-origin
    // embeds only.
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  const headers = new Headers();
  headers.set("Content-Security-Policy", csp);
  // Legacy fallback for browsers that honour X-Frame-Options but not CSP's
  // frame-ancestors; harmless alongside it.
  headers.set("X-Frame-Options", "SAMEORIGIN");
  // 2 years, subdomains included. No `preload` submission is part of this
  // change — that's a one-way registry entry, left for a deliberate follow-up.
  headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains",
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // The app never calls the Geolocation API by design (see
  // packages/shared/src/data/locations.js:325-353 — location is a manual
  // picker, not device geolocation), so camera/mic/geolocation are all denied
  // outright rather than merely restricted to self.
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return headers;
}

export function middleware(request) {
  const response = NextResponse.next();
  securityHeaders().forEach((value, key) => response.headers.set(key, value));
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
    },
  ],
};
