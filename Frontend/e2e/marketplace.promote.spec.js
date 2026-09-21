import { expect, test } from "@playwright/test";
import { signInAsCreator } from "./helpers.js";

/**
 * Flow two: spend credits to promote an ad.
 *
 * This is the only flow in the app where a mistake costs somebody something.
 * The rule it has to hold is stated in `MyAds.confirmPromote`: spend first,
 * badge second — because the other order leaves an ad wearing a promotion the
 * wallet refused to pay for. End to end is where that is worth checking,
 * because the balance and the ad live in two different stores (a cookie on the
 * parent domain, and the listings store) and only a real browser makes both of
 * them behave the way they will in production.
 */
const balance = () => /Balance ([\d,]+) credits/;

test.describe("promoting an ad", () => {
  test("a promotion debits the wallet once and marks the ad", async ({
    page,
  }) => {
    await signInAsCreator(page, { balance: 200 });
    await page.goto("/profile/ads");

    const row = page
      .locator("article")
      .filter({ has: page.getByRole("button", { name: /^Promote / }) })
      .first();
    const title = (
      await row
        .getByRole("button", { name: /^Promote / })
        .getAttribute("aria-label")
    ).replace(/^Promote /, "");

    await row.getByRole("button", { name: `Promote ${title}` }).click();
    const sheet = page.getByRole("dialog", { name: "Promote this ad" });
    await expect(sheet.getByText(balance())).toContainText(
      "Balance 200 credits",
    );

    // Spotlight is the cheapest tier: 20 credits for three days.
    await sheet.getByRole("button", { name: /Spotlight/ }).click();
    await sheet.getByRole("button", { name: "Spend 20 credits" }).click();

    await expect(page.getByText(/180 credits left/)).toBeVisible();
    // The button becomes the receipt — there is nothing left to buy on this ad
    // for the rest of its run.
    await expect(
      page.getByRole("button", { name: `Promote ${title}` }),
    ).toBeHidden();
    await expect(page.getByText("Promoted · 3d")).toBeVisible();

    // The debit is real, and it survives the navigation: the wallet screen
    // reads the same cookie from a different route, and the ledger carries a
    // row naming the ad that was paid for.
    await page.goto("/profile/wallet");
    await expect(page.getByText("180 in your balance")).toBeVisible();
    await expect(page.getByText(`Promoted “${title}”`)).toBeVisible();
    await expect(page.getByText("20 credits spent")).toBeAttached();
  });

  test("a balance too small for a tier cannot buy it", async ({ page }) => {
    await signInAsCreator(page, { balance: 20 });
    await page.goto("/profile/ads");

    await page
      .getByRole("button", { name: /^Promote / })
      .first()
      .click();
    const sheet = page.getByRole("dialog", { name: "Promote this ad" });

    // Headline is 140 credits. It is offered — so you can see what you are
    // short of — but it cannot be selected.
    await expect(
      sheet.getByRole("button", { name: /Headline/ }),
    ).toBeDisabled();
    // And the sheet opened on the one tier 20 credits does cover, rather than
    // on a tier whose confirm button is already refusing to spend.
    await expect(
      sheet.getByRole("button", { name: "Spend 20 credits" }),
    ).toBeEnabled();
  });

  test("an empty wallet spends nothing and points at the top-up", async ({
    page,
  }) => {
    await signInAsCreator(page, { balance: 0 });
    await page.goto("/profile/ads");

    const promote = page.getByRole("button", { name: /^Promote / }).first();
    const title = (await promote.getAttribute("aria-label")).replace(
      /^Promote /,
      "",
    );
    await promote.click();

    const sheet = page.getByRole("dialog", { name: "Promote this ad" });
    await expect(
      sheet.getByRole("button", { name: "Not enough credits" }),
    ).toBeDisabled();
    await expect(sheet.getByRole("link", { name: "Top up" })).toBeVisible();

    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(
      page.getByRole("button", { name: `Promote ${title}` }),
    ).toBeVisible();
    await expect(page.getByText("Promoted · ")).toBeHidden();
  });
});
