import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: { next: () => ({ headers: new Headers() }) },
}));

const apps = {
  personals: () => import("../apps/personals/middleware.js"),
  marketplace: () => import("../apps/marketplace/middleware.js"),
  admin: () => import("../apps/admin/middleware.js"),
};
async function policy(app, environment, api, storage) {
  vi.stubEnv("NODE_ENV", environment);
  vi.stubEnv("NEXT_PUBLIC_API_URL", api);
  vi.stubEnv("NEXT_PUBLIC_STORAGE_URL", storage);
  vi.resetModules();
  const { middleware } = await apps[app]();
  const csp = middleware({}).headers.get("Content-Security-Policy");
  return Object.fromEntries(
    csp.split(";").map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}
afterEach(() => vi.unstubAllEnvs());

describe.each(Object.keys(apps))("%s live Content Security Policy", (app) => {
  test("allows local broadcast/chat, HLS fetches, native video and media workers", async () => {
    const csp = await policy(app, "development", undefined, undefined);
    expect(csp["connect-src"]).toEqual([
      "'self'",
      ...(app === "admin" ? [] : ["https://tiles.openfreemap.org"]),
      "http://localhost:8080",
      "ws://localhost:8080",
      "https://*.gvideo.co",
      "https://*.gvideo.io",
      "http://localhost:9000",
    ]);
    expect(csp["media-src"]).toEqual([
      "'self'",
      "blob:",
      "https://*.gvideo.co",
      "https://*.gvideo.io",
      "http://localhost:9000",
    ]);
    expect(csp["worker-src"]).toEqual(["'self'", "blob:"]);
  });

  test("production permits only the configured secure websocket host and trusted video CDNs", async () => {
    const csp = await policy(
      app,
      "production",
      "https://api.vezlist.example:8443",
      "https://media.vezlist.example",
    );
    expect(csp["connect-src"]).toEqual([
      "'self'",
      ...(app === "admin" ? [] : ["https://tiles.openfreemap.org"]),
      "https://api.vezlist.example:8443",
      "wss://api.vezlist.example:8443",
      "https://*.gvideo.co",
      "https://*.gvideo.io",
      "https://media.vezlist.example",
    ]);
    expect(csp["media-src"]).toContain("https://media.vezlist.example");
    for (const directive of ["connect-src", "media-src"]) {
      for (const broadSource of ["*", "https:", "http:", "ws:", "wss:"]) {
        expect(csp[directive]).not.toContain(broadSource);
      }
    }
    expect(csp["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["frame-ancestors"]).toEqual(["'self'"]);
  });

  test("an unconfigured production API does not introduce a localhost websocket allowance", async () => {
    const csp = await policy(app, "production", undefined, undefined);
    expect(csp["connect-src"].some((source) => /^(ws|wss):/.test(source))).toBe(
      false,
    );
    expect(
      csp["connect-src"].some((source) => source.includes("localhost")),
    ).toBe(false);
  });
});
