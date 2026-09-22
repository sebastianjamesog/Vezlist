import { expect, test } from "@playwright/test";

test("Personals starts and loads local Inter without Google font requests", async ({
  page,
}) => {
  const externalFonts = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => {
    externalFonts.push(route.request().url());
    return route.abort();
  });
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 401, json: { code: "UNAUTHENTICATED" } }),
  );
  await page.route("**/api/v1/categories?**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/feed?**", (route) =>
    route.fulfill({ json: { items: [], hasMore: false } }),
  );

  const response = await page.goto("/");
  expect(response.status()).toBe(200);
  const gate = page.getByRole("dialog", { name: "This site is for adults" });
  await expect(gate).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "personals");

  const loadedFonts = await page.evaluate(async () => {
    const faces = await document.fonts.load('800 28px "Inter Variable"');
    return faces.map((face) => ({ family: face.family, status: face.status }));
  });
  expect(loadedFonts.length).toBeGreaterThan(0);
  expect(loadedFonts.every((font) => font.status === "loaded")).toBe(true);
  await expect(page.locator("body")).toHaveCSS("font-family", /Inter Variable/);

  await gate.getByRole("button", { name: /I am 18 or older/ }).click();
  await expect(gate).toHaveCount(0);
  const login = await page.goto("/login");
  expect(login.status()).toBe(200);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "This site is for adults" }),
  ).toHaveCount(0);
  expect(externalFonts).toEqual([]);
  expect(pageErrors).toEqual([]);
});
