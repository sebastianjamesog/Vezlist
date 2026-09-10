const { test, expect } = require("@playwright/test");

const id = "7b8c4190-4ce1-4327-8758-3265c0ab95cc";
const secondId = "8b8c4190-4ce1-4327-8758-3265c0ab95cc";
// Real Next/React browser interactions; HTTP fixtures intentionally mock the API.
async function fixtures(page, site, options = {}) {
  await page.addInitScript(() =>
    localStorage.setItem("vezlist:age-ok", "true"),
  );
  const requests = [];
  let readAt = null;
  let failLoad = Boolean(options.loadError);
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const reply = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
    if (path === "/auth/me")
      return options.guest
        ? reply({ message: "Sign in" }, 401)
        : reply({ id, name: "Notification user", email: "user@example.test" });
    if (path === "/auth/csrf")
      return reply({ token: "notification-csrf", headerName: "X-CSRF-TOKEN" });
    if (path === "/categories" || path === "/locations") return reply([]);
    if (path.includes("saved"))
      return reply({
        items: [],
        totalCount: 0,
        nextCursor: null,
        hasMore: false,
      });
    if (path === "/me/profile") return reply({ name: "Notification user" });
    if (path.startsWith("/me/notifications")) {
      requests.push({
        path,
        method: request.method(),
        cursor: url.searchParams.get("cursor"),
      });
      expect(url.searchParams.get("site")).toBe(site);
      if (request.method() === "POST") {
        expect(request.headers()["x-csrf-token"]).toBe("notification-csrf");
        if (options.writeError)
          return reply({ message: "Read update failed" }, 503);
        readAt = "2026-09-01T13:00:00Z";
        return reply({ count: 0 });
      }
      if (path.endsWith("unread-count"))
        return reply({ count: options.empty || readAt ? 0 : 1 });
      if (failLoad) {
        return reply({ message: "Could not load alerts" }, 503);
      }
      const more = url.searchParams.has("cursor");
      return reply({
        items: options.empty
          ? []
          : [
              {
                id: more ? secondId : id,
                type: "LISTING_APPROVED",
                title: more ? "Older alert" : "Your ad was approved",
                message: "Your listing is now visible.",
                href: "/profile/ads",
                createdAt: "2026-09-01T12:00:00Z",
                readAt,
              },
            ],
        nextCursor: options.pagination && !more ? "12" : null,
      });
    }
    return reply({ message: "No fixture" }, 404);
  });
  requests.recover = () => {
    failLoad = false;
  };
  return requests;
}

test("notification guests sign in without private API requests", async ({
  page,
}, info) => {
  const requests = await fixtures(page, info.project.name.toUpperCase(), {
    guest: true,
  });
  await page.goto("/profile/notifications");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(requests).toHaveLength(0);
});

test("notification read state persists through reload and updates shared badge", async ({
  page,
}, info) => {
  const requests = await fixtures(page, info.project.name.toUpperCase());
  await page.goto("/profile");
  await expect(
    page.getByRole("link", { name: "Notifications, 1 unread", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Notifications, 1 unread", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your ad was approved" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(page.getByText("All caught up", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Read", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark as read", exact: true }),
  ).toHaveCount(0);
  expect(
    requests.filter((r) => r.method === "POST").map((r) => r.path),
  ).toEqual([`/me/notifications/${id}/read`]);
});

test("notification mark-all confirms a scoped CSRF-protected write", async ({
  page,
}, info) => {
  const requests = await fixtures(page, info.project.name.toUpperCase());
  await page.goto("/profile/notifications");
  await page
    .getByRole("button", { name: "Mark all read", exact: true })
    .click();
  await expect(page.getByText("All caught up", { exact: true })).toBeVisible();
  expect(
    requests.some((r) => r.path.endsWith("/read-all") && r.method === "POST"),
  ).toBe(true);
});

test("notification mutation failure does not falsely mark an alert read", async ({
  page,
}, info) => {
  await fixtures(page, info.project.name.toUpperCase(), { writeError: true });
  await page.goto("/profile/notifications");
  await page.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Read update failed" }),
  ).toBeVisible();
  await expect(page.getByText("Unread", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark as read", exact: true }),
  ).toBeEnabled();
});

test("notification fetch errors can retry into an explicit empty state", async ({
  page,
}, info) => {
  const requests = await fixtures(page, info.project.name.toUpperCase(), {
    loadError: true,
    empty: true,
  });
  await page.goto("/profile/notifications");
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not load alerts" }),
  ).toBeVisible();
  requests.recover();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByText("No notifications", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark all read" })).toHaveCount(
    0,
  );
});

test("notification keyset pagination appends older alerts", async ({
  page,
}, info) => {
  const requests = await fixtures(page, info.project.name.toUpperCase(), {
    pagination: true,
  });
  await page.goto("/profile/notifications");
  await page.getByRole("button", { name: "Load more notifications" }).click();
  await expect(
    page.getByRole("heading", { name: "Older alert" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your ad was approved" }),
  ).toBeVisible();
  expect(requests.some((r) => r.cursor === "12")).toBe(true);
});
