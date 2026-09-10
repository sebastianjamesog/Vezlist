const { test, expect } = require("@playwright/test");

// No routing/interception or mocked authentication. The Java harness provides a
// real Spring session, CSRF middleware, Postgres database and two seeded alerts/site.
test("live login, site inbox and durable read actions", async ({
  page,
}, info) => {
  const site = info.project.name.toUpperCase();
  const apiBase = process.env.VEZLIST_LIVE_API_BASE_URL;
  await page.addInitScript(() =>
    localStorage.setItem("vezlist:age-ok", "true"),
  );
  const apiResponse = (suffix, method = "GET") =>
    page.waitForResponse((response) => {
      const request = response.request();
      const url = new URL(response.url());
      return (
        response.url().startsWith(apiBase) &&
        url.pathname === `/api/v1${suffix}` &&
        request.method() === method
      );
    });
  const assertScope = (response) =>
    expect(new URL(response.url()).searchParams.get("site")).toBe(site);

  await page.goto("/login?next=%2Fprofile");
  await expect(page.locator('input[type="email"]')).toBeEnabled();
  await page
    .locator('input[type="email"]')
    .fill(process.env.VEZLIST_LIVE_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.VEZLIST_LIVE_PASSWORD);
  const loginResponse = apiResponse("/auth/login", "POST");
  const csrfResponse = apiResponse("/auth/csrf");
  await page.locator('form button[type="submit"]').click();
  expect((await loginResponse).status()).toBe(200);
  const { headerName } = await (await csrfResponse).json();
  await expect(
    page.getByRole("link", { name: "Notifications, 2 unread", exact: true }),
  ).toBeVisible();

  const inboxResponse = apiResponse("/me/notifications");
  await page
    .getByRole("link", { name: "Notifications, 2 unread", exact: true })
    .click();
  const inbox = await inboxResponse;
  expect(inbox.status()).toBe(200);
  assertScope(inbox);
  const initial = await inbox.json();
  expect(initial.items).toHaveLength(2);
  expect(initial.items.map((item) => item.type).sort()).toEqual([
    "LISTING_APPROVED",
    "SECURITY_EVENT",
  ]);
  await expect(page.getByRole("article")).toHaveCount(2);

  const target = initial.items[0];
  const readResponse = apiResponse(
    `/me/notifications/${target.id}/read`,
    "POST",
  );
  await page
    .getByRole("article", { name: target.title, exact: true })
    .getByRole("button", { name: "Mark as read", exact: true })
    .click();
  const read = await readResponse;
  expect(read.status()).toBe(200);
  assertScope(read);
  expect(read.request().headers()[headerName.toLowerCase()]).toBeTruthy();
  expect(await read.json()).toEqual({ count: 1 });
  await expect(page.getByText("1 unread", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 unread", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("article", { name: target.title, exact: true })
      .getByText("Read", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark as read", exact: true }),
  ).toHaveCount(1);

  const allResponse = apiResponse("/me/notifications/read-all", "POST");
  await page
    .getByRole("button", { name: "Mark all read", exact: true })
    .click();
  const all = await allResponse;
  expect(all.status()).toBe(200);
  assertScope(all);
  expect(all.request().headers()[headerName.toLowerCase()]).toBeTruthy();
  expect(await all.json()).toEqual({ count: 0 });
  await expect(page.getByText("All caught up", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("All caught up", { exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Mark as read", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Mark all read", exact: true }),
  ).toHaveCount(0);
});
