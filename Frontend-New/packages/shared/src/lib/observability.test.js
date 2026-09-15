import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEnvelope,
  buildEvent,
  parseDsn,
  reportError,
} from "./observability.js";

/**
 * The reporter, under `node --test` with the rest of `lib/`.
 *
 * Three of these four exports are pure functions over a string and an error,
 * which is the reason this file is a transport rather than an SDK: the wire
 * format is small enough to test. The fourth, `reportError`, is tested for the
 * one property that matters more than delivery — that it cannot itself throw.
 * It is called from inside an error boundary; an exception there replaces the
 * apology screen with a blank one.
 *
 * The same file is deployed in all three apps. `identical across all three
 * apps` below is what keeps the copies from drifting.
 */

const DSN = "https://abc123def456@o42.ingest.sentry.io/7654321";

test("a DSN yields the envelope endpoint and the public key", () => {
  const parsed = parseDsn(DSN);
  assert.equal(parsed.publicKey, "abc123def456");
  assert.equal(parsed.projectId, "7654321");
  assert.equal(
    parsed.endpoint,
    "https://o42.ingest.sentry.io/api/7654321/envelope/?sentry_key=abc123def456&sentry_version=7",
  );
});

test("anything that is not a usable DSN is null, never a throw", () => {
  // A bad environment variable must not be able to turn an error boundary
  // into a second error, so every one of these is a quiet null.
  for (const bad of [
    "",
    undefined,
    null,
    "not a url",
    "https://ingest.sentry.io/7654321", // no public key
    "https://key@ingest.sentry.io", // no project
    "https://key@ingest.sentry.io/", // empty project
  ]) {
    assert.equal(
      parseDsn(bad),
      null,
      `expected null for ${JSON.stringify(bad)}`,
    );
  }
});

test("an event carries the message, the scope and the route", () => {
  const event = buildEvent(new TypeError("x.map is not a function"), {
    scope: "route-boundary",
    route: "/ad/a1",
  });

  assert.equal(event.platform, "javascript");
  assert.equal(event.level, "error");
  assert.equal(event.transaction, "/ad/a1");
  assert.equal(event.logger, "route-boundary");
  assert.equal(event.tags.scope, "route-boundary");
  assert.equal(event.exception.values[0].type, "TypeError");
  assert.equal(event.exception.values[0].value, "x.map is not a function");
  assert.match(event.extra.stack, /observability\.test\.js/);
});

test("event ids are 32 hex characters and do not repeat", () => {
  const ids = new Set();
  for (let i = 0; i < 200; i += 1) {
    const { event_id: id } = buildEvent(new Error("boom"));
    assert.match(id, /^[0-9a-f]{32}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 200);
});

test("Next's digest is carried through, because it is the only join key", () => {
  // A server error reaches a client boundary with its message replaced by an
  // opaque digest, and that same digest is in the Worker log. Losing it here
  // makes the two halves of one incident two unrelated reports.
  const error = new Error("An error occurred in the Server Components render.");
  error.digest = "1274978893";

  const event = buildEvent(error, { scope: "route-boundary" });
  assert.equal(event.tags.digest, "1274978893");
  assert.equal(event.extra.digest, "1274978893");
});

test("a thrown non-Error still produces a reportable event", () => {
  // `throw "nope"` is legal JavaScript and a boundary catches it the same way.
  const event = buildEvent("nope", { scope: "global-boundary" });
  assert.equal(event.exception.values[0].type, "Error");
  assert.equal(event.exception.values[0].value, "nope");
});

test("an envelope is three JSON lines, headed by the event id", () => {
  const event = buildEvent(new Error("boom"), { route: "/" });
  const lines = buildEnvelope(event).split("\n");

  assert.equal(lines.length, 3);
  assert.equal(JSON.parse(lines[0]).event_id, event.event_id);
  assert.ok(!Number.isNaN(Date.parse(JSON.parse(lines[0]).sent_at)));
  assert.deepEqual(JSON.parse(lines[1]), { type: "event" });
  assert.equal(JSON.parse(lines[2]).exception.values[0].value, "boom");
});

test("reportError logs once and never throws, configured or not", () => {
  const seen = [];
  const original = console.error;
  console.error = (...args) => seen.push(args);
  try {
    // No DSN is set in the test environment, so this exercises the path every
    // deployment runs on until one is.
    assert.doesNotThrow(() =>
      reportError(new Error("boom"), { scope: "route-boundary", route: "/x" }),
    );
    assert.doesNotThrow(() => reportError(undefined));
    assert.doesNotThrow(() => reportError(null, { scope: "global-boundary" }));
  } finally {
    console.error = original;
  }

  assert.equal(seen.length, 3);
  assert.match(seen[0][0], /route-boundary error on \/x/);
});

/**
 * This replaces a test that asserted three copies of this file — one per app —
 * were byte-identical. A drift check is the right guard for a copy that has to
 * exist; it is the wrong answer to a copy that does not. The module now lives
 * here and all nine call sites import it, so there is nothing left to drift.
 *
 * What is worth asserting is that they all still reach it: an import path that
 * silently stops resolving is how a reporter quietly reports nothing, and every
 * caller is a `catch` nobody watches until the day it matters.
 */
test("every error boundary and instrumentation hook imports the one reporter", async () => {
  const { readFile } = await import("node:fs/promises");
  const SPECIFIER = "@vezlist/shared/lib/observability.js";

  const callers = ["marketplace", "personals", "admin"].flatMap((app) => [
    `../../../../apps/${app}/app/error.jsx`,
    `../../../../apps/${app}/app/global-error.jsx`,
    `../../../../apps/${app}/instrumentation.js`,
  ]);

  for (const path of callers) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.ok(
      source.includes(SPECIFIER),
      `${path} no longer imports ${SPECIFIER} — an error there now goes nowhere`,
    );
    assert.match(
      source,
      /reportError\(/,
      `${path} imports the reporter but never calls it`,
    );
  }
});
