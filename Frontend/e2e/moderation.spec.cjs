const { test, expect } = require("@playwright/test");

const listingId = "7b8c4190-4ce1-4327-8758-3265c0ab95cc";
const ownerId = "50bc4190-4ce1-4327-8758-3265c0ab95cc";
const viewerId = "96bc4190-4ce1-4327-8758-3265c0ab95cc";

// These smoke tests run real Next/React UI with deliberately mocked HTTP responses.
// Backend authorization, persistence, and moderation rules have integration tests.
async function fixtures(page, site, options = {}) {
  // Simulate an adult test account that previously accepted the Personals gate.
  await page.addInitScript(() =>
    localStorage.setItem("vezlist:age-ok", "true"),
  );
  const writes = [];
  let appealed = false;
  const listing = {
    id: listingId,
    ownerId,
    status: options.status ?? "ACTIVE",
    site,
    title: "Moderation browser fixture",
    businessName: "Fixture seller",
    description: "A listing used to verify report and appeal forms.",
    price: 25,
    categoryLabel: "Other",
    provinceLabel: "Ontario",
    locationLabel: "Toronto",
    contactPhone: "4165550100",
    contactEmail: "fixture@example.test",
    media: [],
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
  };
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
        ? reply({ message: "Sign in required" }, 401)
        : reply({
            id: options.owner ? ownerId : viewerId,
            name: "Browser user",
            email: "browser@example.test",
          });
    if (path === "/auth/csrf")
      return reply({ token: "browser-csrf", headerName: "X-CSRF-TOKEN" });
    if (path === "/categories" || path === "/locations") return reply([]);
    if (path === `/listings/${listingId}`) {
      expect(url.searchParams.get("site")).toBe(site);
      return reply(listing);
    }
    if (path === "/me/listings") {
      expect(url.searchParams.get("site")).toBe(site);
      return reply([listing]);
    }
    if (path === `/me/listings/${listingId}/moderation`) {
      expect(url.searchParams.get("site")).toBe(site);
      return reply({
        listingId,
        status: listing.status,
        publicReason: "Please explain the item condition.",
        appealAllowed: !appealed,
      });
    }
    if (path.endsWith("/reports") || path.endsWith("/appeals")) {
      expect(request.method()).toBe("POST");
      expect(request.headers()["x-csrf-token"]).toBe("browser-csrf");
      const body = request.postDataJSON();
      expect(body.site).toBe(site);
      writes.push({ path, body });
      if (options.writeError)
        return reply({ message: options.writeError }, 409);
      if (path.endsWith("/appeals")) appealed = true;
      return reply({ id: "browser-submission-id" }, 201);
    }
    if (path.startsWith("/sellers/"))
      return reply({
        seller: { id: ownerId, displayName: "Fixture seller", verified: false },
        listings: [],
      });
    if (path.includes("saved"))
      return reply({ saved: false, saveCount: 0, items: [], total: 0 });
    return reply({ message: `Unexpected mock request: ${path}` }, 404);
  });
  return writes;
}

test("guest is prompted to sign in before reporting", async ({
  page,
}, testInfo) => {
  await fixtures(page, testInfo.project.name.toUpperCase(), { guest: true });
  await page.goto(`/ad/${listingId}`);
  await page.getByText("Report this ad", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Sign in to report" }),
  ).toHaveAttribute(
    "href",
    `/login?next=${encodeURIComponent(`/ad/${listingId}`)}`,
  );
  await expect(page.getByRole("button", { name: "Submit report" })).toHaveCount(
    0,
  );
});

test("authenticated reporter gets success only after a scoped API submission", async ({
  page,
}, testInfo) => {
  const writes = await fixtures(page, testInfo.project.name.toUpperCase());
  await page.goto(`/ad/${listingId}`);
  await page.getByText("Report this ad", { exact: true }).click();
  await page.getByLabel("Reason", { exact: true }).selectOption("FRAUD");
  await page
    .getByLabel("Details (optional)")
    .fill("Asked for payment before viewing.");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Report submitted." }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({
    reason: "FRAUD",
    details: "Asked for payment before viewing.",
  });
});

test("report errors remain visible and keep the form available", async ({
  page,
}, testInfo) => {
  await fixtures(page, testInfo.project.name.toUpperCase(), {
    writeError: "You already reported this ad.",
  });
  await page.goto(`/ad/${listingId}`);
  await page.getByText("Report this ad", { exact: true }).click();
  await page.getByLabel("Reason", { exact: true }).selectOption("SPAM");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "You already reported this ad." }),
  ).toHaveText("You already reported this ad.");
  await expect(
    page.getByRole("button", { name: "Submit report" }),
  ).toBeEnabled();
  await expect(
    page.getByText("Report submitted.", { exact: false }),
  ).toHaveCount(0);
});

test("owners cannot report their own active ads", async ({
  page,
}, testInfo) => {
  await fixtures(page, testInfo.project.name.toUpperCase(), { owner: true });
  await page.goto(`/ad/${listingId}`);
  await expect(
    page.getByRole("heading", { name: "Moderation browser fixture" }).last(),
  ).toBeVisible();
  await expect(page.getByText("Report this ad", { exact: true })).toHaveCount(
    0,
  );
});

test("rejected owner sees public reason and can submit an appeal", async ({
  page,
}, testInfo) => {
  const writes = await fixtures(page, testInfo.project.name.toUpperCase(), {
    owner: true,
    status: "REJECTED",
  });
  await page.goto("/profile/ads");
  await page.getByText("Review details and appeals", { exact: true }).click();
  await expect(
    page.getByText("Please explain the item condition.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Explain why this decision should be reviewed")
    .fill("The condition is explained in the attached description.");
  await page.getByRole("button", { name: "Submit appeal" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Appeal submitted." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit appeal" })).toHaveCount(
    0,
  );
  expect(writes).toHaveLength(1);
  expect(writes[0].body.message).toBe(
    "The condition is explained in the attached description.",
  );
});

test("removed owner can appeal but cannot edit and sees submission errors", async ({
  page,
}, testInfo) => {
  await fixtures(page, testInfo.project.name.toUpperCase(), {
    owner: true,
    status: "REMOVED",
    writeError: "An appeal is already open.",
  });
  await page.goto("/profile/ads");
  await page.getByText("Review details and appeals", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit and submit" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Explain why this decision should be reviewed")
    .fill("Please review this removal.");
  await page.getByRole("button", { name: "Submit appeal" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "An appeal is already open." }),
  ).toHaveText("An appeal is already open.");
  await expect(
    page.getByRole("button", { name: "Submit appeal" }),
  ).toBeEnabled();
  await expect(
    page.getByText("Appeal submitted.", { exact: false }),
  ).toHaveCount(0);
});
