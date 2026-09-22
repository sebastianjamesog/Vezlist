import { expect, test } from "@playwright/test";
import { PIXEL_PNG } from "./helpers.js";

test.use({ viewport: { width: 1280, height: 900 } });

async function openReadyDraft(page, { failSubmit = false } = {}) {
  const calls = { modes: [], verification: 0, processed: false };
  const category = {
    id: "vehicles",
    label: "Vehicles",
    icon: "Car",
    primary: true,
  };
  const location = {
    id: "bc-1",
    label: "Metro Vancouver",
    provinceId: "bc",
    provinceLabel: "British Columbia",
    popular: true,
  };
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      json: {
        id: "browser-owner",
        name: "Test Poster",
        email: "poster@example.com",
        roles: ["USER"],
      },
    }),
  );
  await page.route("**/api/v1/auth/csrf", (route) =>
    route.fulfill({ json: { token: "browser-csrf" } }),
  );
  await page.route("**/api/v1/categories?**", (route) =>
    route.fulfill({ json: [category] }),
  );
  await page.route("**/api/v1/locations/search**", (route) =>
    route.fulfill({ json: [location] }),
  );
  await page.route("**/api/v1/listings", (route) =>
    route.fulfill({ json: { id: "browser-ad", status: "DRAFT" } }),
  );
  await page.route("**/api/v1/listings/browser-ad/media/upload-url", (route) =>
    route.fulfill({
      json: {
        mediaId: "browser-photo",
        alreadyUploaded: true,
      },
    }),
  );
  await page.route(
    "**/api/v1/listings/browser-ad/media/browser-photo/complete",
    (route) =>
      route.fulfill({
        json: {
          id: "browser-photo",
          status: "PROCESSING",
        },
      }),
  );
  await page.route("**/api/v1/listings/browser-ad?**", (route) => {
    calls.processed = true;
    return route.fulfill({
      json: {
        id: "browser-ad",
        media: [{ id: "browser-photo", status: "READY" }],
      },
    });
  });
  await page.route("**/api/v1/listings/browser-ad/submit", (route) => {
    expect(calls.processed).toBe(true);
    const { requestVerification } = route.request().postDataJSON();
    calls.modes.push(requestVerification);
    return route.fulfill(
      failSubmit
        ? {
            status: 503,
            json: {
              code: "TEMPORARILY_UNAVAILABLE",
              message: "Please try publishing again.",
            },
          }
        : {
            json: {
              id: "browser-ad",
              status: requestVerification ? "PENDING_REVIEW" : "ACTIVE",
              verified: false,
              verificationRequested: requestVerification,
            },
          },
    );
  });
  await page.route("**/api/v1/listings/browser-ad/verification", (route) => {
    calls.verification += 1;
    return route.fulfill({
      json: {
        id: "browser-verification",
        status: "AWAITING_PHOTO",
        code: "123456",
        photoStatus: "NONE",
      },
    });
  });
  await page.addInitScript(
    ({ photo }) => {
      document.cookie = `vezlist_role=${encodeURIComponent(JSON.stringify("creator"))}; path=/`;
      localStorage.setItem(
        "vezlist:ad-draft:v1",
        JSON.stringify({
          images: [{ id: "test-photo", name: "photo.png", url: photo }],
          title: "A complete publication test ad",
          business: "Test Poster",
          category: "Vehicles",
          categoryId: "vehicles",
          description:
            "A detailed description for the publication workflow test.",
          location: "Metro Vancouver",
          locationId: "bc-1",
          provinceId: "bc",
          email: "poster@example.com",
          phone: "2505551234",
        }),
      );
    },
    { photo: `data:image/png;base64,${PIXEL_PNG.toString("base64")}` },
  );
  const session = page.waitForResponse("**/api/v1/auth/me");
  await page.goto("/browse");
  await session;
  await page.getByRole("button", { name: "Post an ad", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Create a new ad" });
  await sheet.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    sheet.getByRole("button", { name: "Vehicles", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    sheet.getByRole("combobox", { name: "Location", exact: true }),
  ).toHaveValue("Metro Vancouver");
  await sheet.getByRole("button", { name: "Next", exact: true }).click();
  return { sheet, calls };
}

test("regular ad publishes after photo processing without starting verification", async ({
  page,
}) => {
  const { sheet, calls } = await openReadyDraft(page);
  await expect(sheet.getByText(/without staff approval/)).toBeVisible();
  await sheet.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText(/Your ad is live/)).toBeVisible();
  await expect(sheet).not.toBeVisible();
  expect(calls.modes).toEqual([false]);
  expect(calls.verification).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("vezlist:ad-draft:v1")),
    )
    .toBe(null);
});

test("verified ad submits privately before opening its verification photo step", async ({
  page,
}) => {
  const { sheet, calls } = await openReadyDraft(page);
  await sheet.getByRole("checkbox", { name: /Post as Verified/ }).check();
  await expect(
    sheet.getByText(/Your ad stays private until staff approve/),
  ).toBeVisible();
  await sheet
    .getByRole("button", { name: "Submit for verification", exact: true })
    .click();
  const verification = page.getByRole("dialog", { name: "Verify this ad" });
  await expect(verification).toBeVisible();
  await expect(verification.getByText("123456", { exact: true })).toBeVisible();
  expect(calls.modes).toEqual([true]);
  expect(calls.verification).toBe(1);
  await expect(page.getByText(/Your ad is live/)).not.toBeVisible();
});

test("failed publication retains the draft and verification selection for recovery", async ({
  page,
}) => {
  const { sheet, calls } = await openReadyDraft(page, { failSubmit: true });
  await sheet.getByRole("checkbox", { name: /Post as Verified/ }).check();
  await sheet
    .getByRole("button", { name: "Submit for verification", exact: true })
    .click();
  await expect(sheet.getByRole("alert")).toContainText(
    "Please try publishing again.",
  );
  await expect(
    sheet.getByRole("checkbox", { name: /Post as Verified/ }),
  ).toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("vezlist:ad-draft:v1"))?.title,
      ),
    )
    .toBe("A complete publication test ad");
  expect(calls.verification).toBe(0);
});
