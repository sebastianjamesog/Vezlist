import { afterEach, beforeEach, expect, test, vi } from "vitest";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let client;
let fetchMock;
beforeEach(async () => {
  vi.resetModules();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  client = await import("./client.js");
});
afterEach(() => vi.unstubAllGlobals());

test("location catalog and search bypass old browser responses while ordinary requests retain default caching", async () => {
  const tree = { provinces: [{ id: "on", label: "Ontario", areas: [{ id: "on-1", label: "Greater Toronto Area", neighbourhoods: [{ id: "scar", label: "Scarborough" }] }] }], popularAreas: [] };
  fetchMock.mockResolvedValue(json(tree));
  const { getLocations, searchLocations } = await import("./catalog.js");
  expect(await getLocations()).toEqual(tree);
  fetchMock.mockResolvedValue(json([]));
  await searchLocations("Scarborough");
  await client.api.get("/api/v1/listings");
  expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
  expect(fetchMock.mock.calls[1][1].cache).toBe("no-store");
  expect(fetchMock.mock.calls[2][1]).not.toHaveProperty("cache");
});

test("staff and public writes use independent CSRF tokens; moderation shares the staff token", async () => {
  fetchMock.mockImplementation(async (url) => {
    if (url.endsWith("/admin/auth/csrf")) return json({ token: "admin-token" });
    if (url.endsWith("/auth/csrf")) return json({ token: "public-token" });
    return json({ ok: true });
  });
  await client.api.post("/api/v1/admin/settings", {});
  await client.api.post("/api/v1/me/preferences", {});
  await client.api.post("/api/v1/moderation/cases/123/decisions", {});
  await client.api.post("/api/v1/support/articles/admin", {});
  await client.api.post("/api/v1/me/preferences", {});
  const writes = fetchMock.mock.calls.filter(
    ([, opts]) => opts.method === "POST",
  );
  expect(writes.map(([, opts]) => opts.headers.get("X-XSRF-TOKEN"))).toEqual([
    "admin-token",
    "public-token",
    "admin-token",
    "admin-token",
    "public-token",
  ]);
  expect(
    fetchMock.mock.calls.filter(([url]) => url.endsWith("/csrf")),
  ).toHaveLength(2);
  expect(
    fetchMock.mock.calls.every(([, opts]) => opts.credentials === "include"),
  ).toBe(true);
});

test("a permission rejection is surfaced without repeating a mutation", async () => {
  fetchMock
    .mockResolvedValueOnce(json({ token: "token" }))
    .mockResolvedValueOnce(
      json({ code: "FORBIDDEN", message: "Permission denied" }, 403),
    );
  await expect(
    client.api.post("/api/v1/admin/settings", {}),
  ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("only explicit CSRF rejection refreshes the affected token and retries once", async () => {
  fetchMock
    .mockResolvedValueOnce(json({ token: "old" }))
    .mockResolvedValueOnce(json({ code: "CSRF_INVALID" }, 403))
    .mockResolvedValueOnce(json({ token: "new" }))
    .mockResolvedValueOnce(json({ ok: true }));
  await expect(
    client.api.post("/api/v1/moderation/cases/123/decisions", {}),
  ).resolves.toEqual({ ok: true });
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/admin\/auth\/csrf$/);
  expect(fetchMock.mock.calls[2][0]).toMatch(/\/admin\/auth\/csrf$/);
  expect(fetchMock.mock.calls[1][1].headers.get("X-XSRF-TOKEN")).toBe("old");
  expect(fetchMock.mock.calls[3][1].headers.get("X-XSRF-TOKEN")).toBe("new");
});

test("a repeated CSRF failure stops after one retry", async () => {
  fetchMock.mockImplementation(async (url) =>
    url.endsWith("/csrf")
      ? json({ token: "token" })
      : json({ code: "CSRF_INVALID" }, 403),
  );
  await expect(
    client.api.post("/api/v1/admin/settings", {}),
  ).rejects.toMatchObject({ code: "CSRF_INVALID" });
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test("failed CSRF retrieval sends no mutation and is recoverable on the next attempt", async () => {
  fetchMock.mockRejectedValueOnce(new Error("Offline"));
  await expect(client.api.post("/api/v1/admin/settings", {})).rejects.toThrow(
    "Offline",
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock
    .mockResolvedValueOnce(json({ token: "recovered" }))
    .mockResolvedValueOnce(json({ ok: true }));
  await expect(client.api.post("/api/v1/admin/settings", {})).resolves.toEqual({
    ok: true,
  });
});

test("resetting admin auth leaves the public token cache intact", async () => {
  fetchMock.mockImplementation(async (url) =>
    url.endsWith("/csrf")
      ? json({
          token: url.includes("/admin/") ? "admin-token" : "public-token",
        })
      : json({ ok: true }),
  );
  await client.api.post("/api/v1/auth/login", {});
  await client.api.post("/api/v1/admin/auth/login", {});
  client.resetCsrfToken("/api/v1/admin/auth");
  await client.api.post("/api/v1/auth/logout");
  await client.api.post("/api/v1/admin/auth/logout");
  const tokenRequests = fetchMock.mock.calls.filter(([url]) =>
    url.endsWith("/csrf"),
  );
  expect(tokenRequests.map(([url]) => new URL(url).pathname)).toEqual([
    "/api/v1/auth/csrf",
    "/api/v1/admin/auth/csrf",
    "/api/v1/admin/auth/csrf",
  ]);
});
