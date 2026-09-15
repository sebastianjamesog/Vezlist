import assert from "node:assert/strict";
import test from "node:test";
import { api, ApiError, resetApiSecurityState } from "./api.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test.beforeEach(() => {
  resetApiSecurityState();
});

test("GET requests include the browser session", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "http://localhost:8080/api/v1/auth/me");
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "include");
    return jsonResponse({ id: "user-1" });
  });

  assert.deepEqual(await api("/auth/me"), { id: "user-1" });
});

test("writes fetch and send the Spring Security CSRF token", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/csrf")) {
      return jsonResponse({ headerName: "X-XSRF-TOKEN", token: "safe-token" });
    }
    return jsonResponse({ saved: true });
  });

  assert.deepEqual(
    await api("/listings/123/saved?site=MARKETPLACE", {
      method: "POST",
      body: { source: "detail" },
    }),
    { saved: true },
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.get("X-XSRF-TOKEN"), "safe-token");
  assert.equal(
    calls[1].options.headers.get("Content-Type"),
    "application/json",
  );
  assert.equal(calls[1].options.body, '{"source":"detail"}');
});

test("CSRF state is shared across sequential writes", async (t) => {
  let csrfCalls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.endsWith("/auth/csrf")) {
      csrfCalls += 1;
      return jsonResponse({ headerName: "X-CSRF", token: "one-token" });
    }
    return new Response(null, { status: 204 });
  });

  await api("/auth/logout", { method: "POST" });
  await api("/auth/logout", { method: "POST" });
  assert.equal(csrfCalls, 1);
});

test("backend errors keep their status and validation details", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(
      {
        message: "One or more fields are invalid.",
        details: [{ field: "email", message: "Invalid email." }],
      },
      400,
    ),
  );

  await assert.rejects(api("/auth/me"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.details[0].field, "email");
    return true;
  });
});

test("invalid relative API paths are rejected before fetching", async () => {
  await assert.rejects(api("auth/me"), /must start with '\/'/);
});
