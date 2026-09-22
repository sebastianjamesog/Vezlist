import { expect, test } from "@playwright/test";
import { PIXEL_PNG } from "./helpers.js";

test.use({
  viewport: { width: 1280, height: 900 },
  geolocation: { latitude: 48.4284, longitude: -123.3656 },
  permissions: ["geolocation"],
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

const style = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#e5e7eb" },
    },
  ],
};
const rows = [
  {
    id: "map-bike",
    title: "Map test bike",
    latitude: 48.4284,
    longitude: -123.3656,
  },
  {
    id: "map-chair",
    title: "Map test chair",
    latitude: 48.4284,
    longitude: -123.3656,
  },
  {
    id: "map-desk",
    title: "Map test desk",
    latitude: 48.4504,
    longitude: -123.34,
  },
].map((row) => ({
  ...row,
  categoryLabel: "Buy/Sell",
  distanceKm: 1,
  price: 25,
  imageUrl: `data:image/png;base64,${PIXEL_PNG.toString("base64")}`,
}));

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/listings?**", (route) =>
    route.fulfill({ json: { items: rows, nextCursor: null, hasMore: false } }),
  );
});

test("vector map retains attribution, photo clusters, and keyboard selection", async ({
  page,
}) => {
  const legacyRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("cartocdn.com"))
      legacyRequests.push(request.url());
  });
  // Exercise the real renderer without making CI depend on public tile hosting.
  await page.route("https://tiles.openfreemap.org/styles/positron", (route) =>
    route.fulfill({ json: style }),
  );
  await page.goto("/nearby");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".leaflet-control-attribution")).toContainText(
    "OpenMapTiles",
  );
  const cluster = page.locator(
    '.leaflet-marker-icon[title^="2 listings here"]',
  );
  await expect(cluster).toBeVisible();
  const pin = page.locator('.leaflet-marker-icon[title^="Map test desk"]');
  await pin.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".vz-pin--selected")).toHaveCount(1);
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.locator(".vz-pin--selected")).toHaveCount(0);
  // Space activates photo pins too, without scrolling the surrounding page.
  await pin.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".vz-pin--selected")).toHaveCount(1);
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await cluster.focus();
  await page.keyboard.press("Enter");
  await expect(pin).toHaveCount(0); // Cluster expansion zooms past the distant pin.
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("button", { name: "Center on my location" }).click();
  await page.setViewportSize({ width: 430, height: 900 });
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  expect(legacyRequests).toEqual([]);
});

test("failed tile sources keep the warning visible and can be retried", async ({
  page,
}) => {
  let failing = true;
  await page.route("https://tiles.openfreemap.org/styles/positron", (route) =>
    route.fulfill({
      json: failing
        ? {
            ...style,
            sources: {
              test: {
                type: "vector",
                url: "https://tiles.openfreemap.org/planet",
              },
            },
            layers: [
              ...style.layers,
              {
                id: "test",
                type: "fill",
                source: "test",
                "source-layer": "land",
              },
            ],
          }
        : style,
    }),
  );
  await page.route("https://tiles.openfreemap.org/planet", (route) =>
    route.abort(),
  );
  await page.goto("/nearby");
  await expect(page.getByRole("status")).toContainText(
    "Some map imagery couldn't load",
  );
  await expect(
    page.getByRole("heading", { name: "Map test bike" }),
  ).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Retry map" }).click();
  await expect(page.getByRole("button", { name: "Retry map" })).toHaveCount(0);
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
  await expect(
    page.locator('.leaflet-marker-icon[title^="Map test desk"]'),
  ).toBeVisible();
});
