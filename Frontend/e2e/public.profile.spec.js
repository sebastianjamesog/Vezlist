import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 900 } });

async function profileApi(page, site, { failCounts = false } = {}) {
  const requests = [];
  const identity = {
    id: "profile-owner",
    name: "Actual Member",
    email: "member@example.com",
    roles: ["USER"],
  };
  await page.route("**/api/v1/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/v1/auth/me") return route.fulfill({ json: identity });
    if (path === "/api/v1/me/profile")
      return route.fulfill({
        json: { ...identity, avatarUrl: null, location: "Ottawa, ON" },
      });
    if (path === "/api/v1/me/notifications/unread-count")
      return route.fulfill({ json: { count: 0 } });
    if (path === "/api/v1/categories") return route.fulfill({ json: [] });
    if (
      path === "/api/v1/me/listings/summary" ||
      path === "/api/v1/me/saved-listings"
    ) {
      requests.push({ path, site: url.searchParams.get("site") });
      expect(url.searchParams.get("site")).toBe(site);
      if (failCounts && path.endsWith("/summary")) {
        return route.fulfill({
          status: 503,
          json: { code: "UNAVAILABLE", message: "Try again" },
        });
      }
      if (path.endsWith("/summary"))
        return route.fulfill({ json: { activeAds: 7 } });
      const limit = Number(url.searchParams.get("limit"));
      const rows = Array.from({ length: Math.min(limit, 13) }, (_, index) => ({
        id: `saved-${index}`,
      }));
      return route.fulfill({
        json: {
          items: rows,
          totalCount: 13,
          hasMore: limit < 13,
          nextCursor: limit < 13 ? "next-page" : null,
        },
      });
    }
    return route.fulfill({ status: 404, json: { code: "NOT_FOUND" } });
  });
  await page.addInitScript(() => {
    document.cookie = `vezlist_role=${encodeURIComponent(JSON.stringify("creator"))}; path=/`;
    localStorage.setItem(
      "vezlist:age-gate:v1",
      JSON.stringify({ confirmed: true }),
    );
  });
  return {
    requests,
    recoverCounts: () => {
      failCounts = false;
    },
  };
}

test("profile card uses real account data and exact site counts, without demo claims", async ({
  page,
}, testInfo) => {
  const site =
    testInfo.project.name === "personals" ? "PERSONALS" : "MARKETPLACE";
  const { requests } = await profileApi(page, site);
  await page.goto("/profile");
  const card = page.getByRole("region", { name: "Your profile" });
  await expect(
    card.getByRole("heading", { name: "Actual Member" }),
  ).toBeVisible();
  await expect(card.getByText("Ottawa, ON", { exact: true })).toBeVisible();
  await expect(card.getByText("7", { exact: true })).toBeVisible();
  await expect(card.getByText("13", { exact: true })).toBeVisible();
  await expect(
    card.getByRole("img", { name: "No profile photo" }),
  ).toBeVisible();
  await expect(card.getByText("Views this week")).toHaveCount(0);
  await expect(card.getByText("24", { exact: true })).toHaveCount(0);
  await expect(card.getByText("1,300", { exact: true })).toHaveCount(0);
  await expect(card.locator(".lucide-badge-check")).toHaveCount(0);
  expect(requests.some((request) => request.path.endsWith("/summary"))).toBe(
    true,
  );
  await card.screenshot({ path: testInfo.outputPath("profile-card.png") });
});

test("a failed count stays unavailable and can be retried without losing identity", async ({
  page,
}, testInfo) => {
  const site =
    testInfo.project.name === "personals" ? "PERSONALS" : "MARKETPLACE";
  const { recoverCounts } = await profileApi(page, site, { failCounts: true });
  await page.goto("/profile");
  const card = page.getByRole("region", { name: "Your profile" });
  await expect(
    card.getByRole("heading", { name: "Actual Member" }),
  ).toBeVisible();
  await expect(card.getByText("13", { exact: true })).toBeVisible();
  await expect(card.getByText("Unavailable", { exact: true })).toBeVisible();
  recoverCounts();
  await card.getByRole("button", { name: "Retry active ads" }).click();
  await expect(card.getByText("7", { exact: true })).toBeVisible();
  await expect(card.getByText("Unavailable", { exact: true })).toHaveCount(0);
});
