import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers.js";

/**
 * Flow three: moderate a listing in the console.
 *
 * Worth an end-to-end test for a reason the other two do not have: the
 * permission model is enforced twice, in two places, on purpose — the screens
 * decide what to render and the reducer decides what to honour — and the whole
 * point of that arrangement is that the second check holds when the first one
 * is bypassed. A component test can only ever exercise one of the two at a
 * time. Here the console is driven the way a moderator drives it, and the
 * audit log is read afterwards to check that what the queue said it did is
 * what the store actually recorded.
 *
 * The audit is read through its own `?q=` filter rather than by eye: these run
 * at a phone width, where the console's tables scroll sideways and the Note
 * column is genuinely off-screen. Filtering asks the store the question
 * directly, which is what is actually under test.
 */

/** The title in the first data row of whatever queue is on screen. */
const firstRowTitle = (page) =>
  page.getByRole("row").nth(1).locator("p").first().innerText();

/** The audit, filtered to entries whose note is this ad's title. */
const auditFor = (page, note) =>
  page.goto(`/audit?q=${encodeURIComponent(note)}`);

test.describe("moderating a listing", () => {
  test("a moderator approves an ad and the audit log records who and what", async ({
    page,
  }) => {
    await signInAsAdmin(page, "moderator");
    await page.goto("/listings?status=pending");

    const title = await firstRowTitle(page);
    await page.getByRole("checkbox", { name: `Select ${title}` }).check();
    await expect(page.getByText("1 selected")).toBeVisible();
    await page.getByRole("button", { name: "Approve", exact: true }).click();

    await expect(page.getByText("Approved 1 ad")).toBeVisible();
    // Off the pending queue, because it is not pending any more.
    await expect(page.getByText(title)).toBeHidden();

    await auditFor(page, title);
    const row = page.getByRole("row").nth(1);
    await expect(row).toContainText("approve");
    await expect(row).toContainText("Priya Nair");
  });

  test("a rejection cannot be filed without a reason, and the reason is kept", async ({
    page,
  }) => {
    await signInAsAdmin(page, "moderator");
    await page.goto("/listings?status=pending");

    const title = await firstRowTitle(page);
    await page.getByRole("checkbox", { name: `Select ${title}` }).check();
    await page.getByRole("button", { name: "Reject", exact: true }).click();

    const reason = `Contact details in the photos ${Date.now()}`;
    const dialog = page.getByRole("dialog", { name: "Reject this ad" });
    await expect(dialog.getByRole("button", { name: "Reject" })).toBeDisabled();

    await dialog.getByRole("textbox").fill(reason);
    await expect(dialog.getByRole("button", { name: "Reject" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Reject" }).click();

    await expect(page.getByText("Rejected 1 ad")).toBeVisible();

    // The reason is what the seller and the audit log both read, so it has to
    // be the reason that was typed and not a placeholder.
    await auditFor(page, reason);
    await expect(page.getByRole("row").nth(1)).toContainText("reject");
  });

  test("the queue in the URL is a link another moderator can open", async ({
    page,
  }) => {
    await signInAsAdmin(page, "moderator");
    await page.goto("/listings?status=pending&site=personals");

    const heading = page.getByText(/ads across both sites$/);
    const [shown, total] = (await heading.innerText())
      .match(/(\d+) of (\d+)/)
      .slice(1)
      .map(Number);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(total);

    // Every row on screen is on the board the link asked for. Third cell of each body row: 1 is the select box, 2 the ad, 3 the site.
    const sites = await page
      .locator("tbody tr td:nth-child(3)")
      .allInnerTexts();
    expect(sites.length).toBe(shown);
    for (const site of sites) expect(site.toLowerCase()).toContain("personals");
  });

  test("support may open the queue but the store refuses its moderation", async ({
    page,
  }) => {
    await signInAsAdmin(page, "support");
    await page.goto("/listings?status=pending");

    const heading = page.getByText(/ads across both sites$/);
    const before = await heading.innerText();

    const title = await firstRowTitle(page);
    await page.getByRole("checkbox", { name: `Select ${title}` }).check();
    await page.getByRole("button", { name: "Approve", exact: true }).click();

    // The reducer is the access check — `adminRoles.js` gives support no
    // `listing.moderate` — so the queue is exactly as long as it was and the
    // ad is still on it. Hiding the button is the screens' job, and this is
    // the test that the reducer does not depend on their doing it.
    await expect(heading).toHaveText(before);
    await expect(page.getByText(title).first()).toBeVisible();

    // And nothing was written: no audit entry names this ad.
    await auditFor(page, title);
    await expect(page.getByText("No entries match")).toBeVisible();
  });
});
