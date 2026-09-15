import { expect, test } from "@playwright/test";
import { PIXEL_PNG, signInAsCreator } from "./helpers.js";

/**
 * Flow one: post an ad, end to end.
 *
 * The path is the plus in the bottom bar, four wizard steps, and My Ads. It is
 * worth an end-to-end test rather than a component one because it is the only
 * flow in the app that crosses every layer at once: a portalled sheet in the
 * shell, `lib/adDraft.js` validating step by step, the `FileReader` that turns
 * a picked photo into something storable, `ListingsContext` writing it, and a
 * *different route* reading it back out of storage afterwards. Any one of
 * those can be green on its own while the ad still never arrives.
 */
test.describe("posting an ad", () => {
  test("an ad posted through the wizard turns up in My Ads, in review", async ({
    page,
  }) => {
    await signInAsCreator(page);
    const title = `E2E Oak Desk ${Date.now()}`;

    await page.goto("/");
    await page.getByRole("button", { name: "Create" }).click();

    const sheet = page.getByRole("dialog", { name: "Create a new ad" });
    await expect(sheet).toBeVisible();

    // Step 1 — photos. The step refuses to advance without one.
    await sheet.getByRole("button", { name: "Next" }).click();
    await expect(sheet.getByText("Add at least one photo.")).toBeVisible();

    await sheet.locator('input[type="file"]').setInputFiles({
      name: "desk.png",
      mimeType: "image/png",
      buffer: PIXEL_PNG,
    });
    await sheet.getByRole("button", { name: "Next" }).click();

    // Step 2 — details. Same rule: the step names what is missing.
    await sheet.getByRole("button", { name: "Next" }).click();
    await expect(
      sheet.getByText("Give your ad a title of at least 4 characters."),
    ).toBeVisible();

    await sheet.getByLabel("Title").fill(title);
    await sheet.getByLabel("Business / Seller name").fill("E2E Furniture");
    await sheet
      .getByRole("button", { name: "Home & Garden", exact: true })
      .click();
    await sheet.getByLabel("Price").fill("240");
    await sheet
      .getByLabel("Description")
      .fill("Solid oak desk in very good condition, collection only.");
    await sheet.getByRole("button", { name: "Next" }).click();

    // Step 3 — contact.
    await expect(
      sheet.getByRole("heading", { name: "Where and how to reach you" }),
    ).toBeVisible();
    await sheet.getByLabel("Location").fill("Metro Vancouver");
    await sheet.getByLabel("Email").fill("poster@example.com");
    await sheet.getByRole("button", { name: "Next" }).click();
    await expect(
      sheet.getByText("Enter a phone number with 7-15 digits."),
    ).toBeVisible();
    await sheet.getByLabel("Phone").fill("+1 250 555 1234");
    await sheet.getByRole("button", { name: "Next" }).click();

    // Step 4 — review, then publish.
    await expect(sheet.getByText("Check it over")).toBeVisible();
    await expect(sheet.getByRole("heading", { name: title })).toBeVisible();
    await sheet.getByRole("button", { name: "Publish" }).click();

    await expect(page.getByText(/Ad submitted/)).toBeVisible();

    // The claim the toast makes, checked on the screen that would have to
    // honour it — and on a fresh load, so it came out of storage and not out
    // of a React state that happened to survive.
    await page.goto("/profile/ads");
    await page.getByRole("button", { name: /^In review/ }).click();
    await expect(
      page.getByRole("button", { name: `Edit ${title}` }),
    ).toBeVisible();
  });

  test("a browsing account is offered the switch instead of the wizard", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      document.cookie = `vezlist_session=${encodeURIComponent(
        JSON.stringify({
          name: "Test Reader",
          email: "reader@example.com",
          role: "user",
        }),
      )}; path=/`;
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(
      page.getByText(/Switch to an ads creator account/),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Create a new ad" }),
    ).toBeHidden();
  });

  test("a signed-out visitor is sent to sign in rather than into the wizard", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page).toHaveURL(/\/login/);
  });
});
