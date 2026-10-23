import { afterEach, expect, test, vi } from "vitest";

const json = (body, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

for (const site of ["admin", "marketplace", "personals"]) {
  test(`${site} login, restoration, logout and notifications use their own session routes`, async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE", site);
    const fetchMock = vi.fn(async (url) =>
      url.endsWith("/csrf")
        ? json({ token: "token" })
        : url.endsWith("/logout")
          ? json(null, 204)
          : json({ id: "account" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = await import("./auth.js");
    const notifications = await import("./notifications.js");
    await auth.login({ email: "account@example.test", password: "test-only" });
    await auth.me();
    await notifications.listNotifications();
    await notifications.getUnreadCount();
    await notifications.markNotificationRead("notice");
    await notifications.markAllNotificationsRead();
    await auth.logout();
    const authBase = site === "admin" ? "/api/v1/admin/auth" : "/api/v1/auth";
    const inboxBase =
      site === "admin"
        ? "/api/v1/admin/me/notifications"
        : "/api/v1/me/notifications";
    const paths = fetchMock.mock.calls.map(([url]) => new URL(url).pathname);
    expect(paths).toContain(`${authBase}/csrf`);
    expect(paths).toContain(`${authBase}/login`);
    expect(paths).toContain(`${authBase}/me`);
    expect(paths).toContain(`${authBase}/logout`);
    expect(paths).toContain(inboxBase);
    expect(paths).toContain(`${inboxBase}/unread-count`);
    expect(paths).toContain(`${inboxBase}/notice/read`);
    expect(paths).toContain(`${inboxBase}/read-all`);
    if (site === "admin")
      expect(paths.every((path) => path.startsWith("/api/v1/admin/"))).toBe(
        true,
      );
    else
      expect(paths.some((path) => path.startsWith("/api/v1/admin/"))).toBe(
        false,
      );
  });
}
