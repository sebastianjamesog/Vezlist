import { beforeEach, describe, expect, test } from "vitest";
import {
  renderApp,
  screen,
  seedWallet,
  signIn,
  userEvent,
  waitFor,
  within,
} from "../../../../testing/render.jsx";
import MyAds from "./MyAds";
import { buildSeed } from "../lib/listings";
import { boostOptions } from "../data/mock";

/**
 * My Ads, over the `lib/listings.js` store.
 *
 * `listings.test.js` proves the reducer: renew moves an ad back to pending,
 * promote stamps a boost, remove drops a row. What it cannot prove is that any
 * of that is reachable — that the Promote button opens the sheet, that the
 * sheet spends through the *wallet* rather than around it, and that an ad
 * nobody paid for never wears a badge. Those live here, and this is the
 * component half the issue says is missing for the stores that landed with no
 * screen-level test.
 */
const cheapest = boostOptions.reduce((a, b) =>
  a.credits <= b.credits ? a : b,
);
const dearest = boostOptions.reduce((a, b) => (a.credits >= b.credits ? a : b));

/** The seeded ads, so the test names rows the store will actually have. */
const seed = buildSeed().ads;
const activeAd = seed.find((a) => a.status === "active" && !a.boost);
const expiredAd = seed.find((a) => a.status === "expired");

const tab = (name) =>
  screen.getByRole("button", { name: new RegExp(`^${name}`) });

describe("MyAds", () => {
  beforeEach(() => {
    signIn({ role: "creator" });
  });

  test("a browsing account is offered the switch rather than the screen", () => {
    signIn({ role: "user" });
    renderApp(<MyAds />);

    expect(screen.getByText("This is a creator screen")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Become an ads creator" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Promote / })).toBe(null);
  });

  test("switching to creator opens the screen in place", async () => {
    const user = userEvent.setup();
    signIn({ role: "user" });
    renderApp(<MyAds />);

    await user.click(
      screen.getByRole("button", { name: "Become an ads creator" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `Edit ${activeAd.title}` }),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("This is a creator screen")).toBe(null);
  });

  test("the tabs count the ads in each state and filter to them", async () => {
    const user = userEvent.setup();
    renderApp(<MyAds />);

    // Opens on Active; the expired row is not on screen.
    expect(
      screen.getByRole("button", { name: `Edit ${activeAd.title}` }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: `Renew ${expiredAd.title}` }),
    ).toBe(null);

    await user.click(tab("Expired"));
    expect(
      screen.getByRole("button", { name: `Renew ${expiredAd.title}` }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: `Edit ${activeAd.title}` }),
    ).toBe(null);
  });

  test("an expired ad renews back into review, not straight onto the board", async () => {
    const user = userEvent.setup();
    renderApp(<MyAds />);

    await user.click(tab("Expired"));
    const before = Number(tab("Expired").textContent.match(/\((\d+)\)/)[1]);
    await user.click(
      screen.getByRole("button", { name: `Renew ${expiredAd.title}` }),
    );

    expect(await screen.findByText(/^Reposted/)).toBeTruthy();
    expect(Number(tab("Expired").textContent.match(/\((\d+)\)/)[1])).toBe(
      before - 1,
    );
    // Back into the queue, not live.
    await user.click(tab("In review"));
    expect(
      screen.getByRole("button", { name: `Edit ${expiredAd.title}` }),
    ).toBeTruthy();
  });

  test("delete asks first, and Cancel keeps the ad", async () => {
    const user = userEvent.setup();
    renderApp(<MyAds />);

    await user.click(
      screen.getByRole("button", { name: `Delete ${activeAd.title}` }),
    );
    expect(screen.getByRole("dialog", { name: /Delete/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("button", { name: `Edit ${activeAd.title}` }),
    ).toBeTruthy();
  });

  test("confirming the delete removes the row", async () => {
    const user = userEvent.setup();
    renderApp(<MyAds />);

    await user.click(
      screen.getByRole("button", { name: `Delete ${activeAd.title}` }),
    );
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: `Edit ${activeAd.title}` }),
      ).toBe(null),
    );
  });

  test("promoting spends the credits and marks the ad, in that order", async () => {
    const user = userEvent.setup();
    seedWallet({ balance: dearest.credits });
    renderApp(<MyAds />);

    await user.click(
      screen.getByRole("button", { name: `Promote ${activeAd.title}` }),
    );
    const sheet = screen.getByRole("dialog", { name: "Promote this ad" });
    expect(
      within(sheet).getByText(`Balance ${dearest.credits} credits`),
    ).toBeTruthy();

    await user.click(
      within(sheet).getByRole("button", { name: new RegExp(cheapest.label) }),
    );
    await user.click(
      within(sheet).getByRole("button", {
        name: `Spend ${cheapest.credits} credits`,
      }),
    );

    // The receipt replaces the button, and the toast names what is left.
    expect(
      await screen.findByText(
        new RegExp(`${dearest.credits - cheapest.credits} credits left`),
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: `Promote ${activeAd.title}` }),
    ).toBe(null);
    expect(
      screen.getByText(new RegExp(`Promoted · ${cheapest.days}d`)),
    ).toBeTruthy();
  });

  test("a balance that cannot cover a tier cannot select it", async () => {
    const user = userEvent.setup();
    seedWallet({ balance: cheapest.credits });
    renderApp(<MyAds />);

    await user.click(
      screen.getByRole("button", { name: `Promote ${activeAd.title}` }),
    );
    const sheet = screen.getByRole("dialog", { name: "Promote this ad" });

    const dear = within(sheet).getByRole("button", {
      name: new RegExp(dearest.label),
    });
    expect(dear.disabled).toBe(true);
    // And the sheet opened on one the balance *can* pay for, rather than on a
    // tier whose confirm button is already refusing.
    expect(
      within(sheet).getByRole("button", {
        name: `Spend ${cheapest.credits} credits`,
      }),
    ).toBeTruthy();
  });

  test("an empty wallet leaves the ad unpromoted and says why", async () => {
    const user = userEvent.setup();
    seedWallet({ balance: 0 });
    renderApp(<MyAds />);

    await user.click(
      screen.getByRole("button", { name: `Promote ${activeAd.title}` }),
    );
    const sheet = screen.getByRole("dialog", { name: "Promote this ad" });

    // Nothing is affordable, so nothing is spendable and the sheet says so
    // rather than offering a purchase it would then refuse.
    expect(
      within(sheet).getByRole("button", { name: "Not enough credits" })
        .disabled,
    ).toBe(true);
    expect(within(sheet).getByRole("link", { name: "Top up" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: `Promote ${activeAd.title}` }),
    ).toBeTruthy();
  });

  test("editing an ad validates every step at once", async () => {
    const user = userEvent.setup();
    renderApp(<MyAds />);

    await user.click(
      screen.getByRole("button", { name: `Edit ${activeAd.title}` }),
    );
    const sheet = screen.getByRole("dialog", { name: "Edit this ad" });

    const title = within(sheet).getByDisplayValue(activeAd.title);
    await user.clear(title);
    await user.type(title, "no");
    await user.click(
      within(sheet).getByRole("button", { name: "Save changes" }),
    );

    // Still open, complaining, and the store is untouched.
    expect(screen.getByRole("dialog", { name: "Edit this ad" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: `Edit ${activeAd.title}` }),
    ).toBeTruthy();
  });
});
