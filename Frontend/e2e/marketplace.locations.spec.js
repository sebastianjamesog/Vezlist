import { expect, test } from "@playwright/test";
import { PIXEL_PNG } from "./helpers.js";

test.use({ viewport: { width: 1280, height: 900 } });

const suggestions = Array.from({ length: 30 }, (_, index) => ({
  id: `bc-backend-${index}`,
  label: `Backend District ${index + 1}`,
  provinceId: "bc",
  provinceLabel: "British Columbia",
  popular: index < 8,
}));
const searched = {
  id: "on-remote-village",
  label: "Remote Village",
  provinceId: "on",
  provinceLabel: "Ontario",
  popular: false,
};

test("posting selects backend categories and searches locations within two suggestion rows", async ({
  page,
}) => {
  const queries = [];
  const categorySites = [];
  await page.route("**/api/v1/categories?**", (route) => {
    categorySites.push(new URL(route.request().url()).searchParams.get("site"));
    return route.fulfill({
      json: [
        {
          id: "backend-category-42",
          label: "New backend category",
          icon: "Tag",
          primary: true,
        },
      ],
    });
  });
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      json: {
        id: "location-test-user",
        name: "Location Tester",
        email: "location@example.com",
        roles: ["USER"],
      },
    }),
  );
  await page.route("**/api/v1/locations/search**", (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") ?? "";
    queries.push(query);
    return route.fulfill({ json: query ? [searched] : suggestions });
  });
  await page.addInitScript(
    ({ image }) => {
      document.cookie = `vezlist_role=${encodeURIComponent(JSON.stringify("creator"))}; path=/`;
      localStorage.setItem(
        "vezlist:ad-draft:v1",
        JSON.stringify({
          images: [{ id: "test-photo", name: "test.png", url: image }],
          title: "Location test listing",
          business: "Test seller",
          category: "Property",
          description:
            "A test listing with enough detail to reach the location picker.",
          location: "",
          locationId: "",
          provinceId: "",
          email: "seller@example.com",
          phone: "2505551234",
        }),
      );
    },
    { image: `data:image/png;base64,${PIXEL_PNG.toString("base64")}` },
  );
  const sessionLoaded = page.waitForResponse("**/api/v1/auth/me");
  // The shared posting form can be opened from any shell route.
  await page.goto("/browse");
  await sessionLoaded;
  await page.getByRole("button", { name: "Post an ad", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Create a new ad" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Next", exact: true }).click();
  await sheet
    .getByRole("button", { name: "New backend category", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const draft = JSON.parse(localStorage.getItem("vezlist:ad-draft:v1"));
        return { category: draft.category, categoryId: draft.categoryId };
      }),
    )
    .toEqual({
      category: "New backend category",
      categoryId: "backend-category-42",
    });
  expect(categorySites.length).toBeGreaterThan(0);
  expect(categorySites.every((site) => site === "MARKETPLACE")).toBe(true);
  await sheet.getByRole("button", { name: "Next", exact: true }).click();
  const input = sheet.getByRole("combobox", { name: "Location", exact: true });
  const group = sheet.getByRole("group", { name: "Suggested locations" });
  await expect(group.getByRole("button").first()).toBeVisible();
  const countRows = () =>
    group
      .getByRole("button")
      .evaluateAll(
        (buttons) =>
          new Set(
            buttons.map((button) =>
              Math.round(button.getBoundingClientRect().top),
            ),
          ).size,
      );
  await expect.poll(countRows).toBe(2);
  expect(await group.getByRole("button").count()).toBeLessThan(
    suggestions.length,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(countRows).toBe(2);

  await input.fill("Remote");
  const option = sheet.getByRole("option", { name: /Remote Village/ });
  await expect(option).toBeVisible();
  await expect(option).toContainText("Ontario");
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue("Remote Village");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const draft = JSON.parse(localStorage.getItem("vezlist:ad-draft:v1"));
        return {
          location: draft.location,
          locationId: draft.locationId,
          provinceId: draft.provinceId,
        };
      }),
    )
    .toEqual({
      location: "Remote Village",
      locationId: searched.id,
      provinceId: "on",
    });
  expect(queries).toContain("Remote");
  expect(queries).toContain("");

  await input.fill("Unselected text");
  await sheet.getByRole("button", { name: "Next", exact: true }).click();
  await expect(sheet.getByRole("alert")).toContainText("Select a location");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const draft = JSON.parse(localStorage.getItem("vezlist:ad-draft:v1"));
        return Boolean(draft.locationId || draft.provinceId);
      }),
    )
    .toBe(false);
});
