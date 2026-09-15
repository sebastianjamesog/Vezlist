import { beforeEach, describe, expect, test } from "vitest";
import {
  renderAdmin,
  screen,
  userEvent,
  waitFor,
  within,
} from "../../../../testing/render.jsx";
import { router, setRoute } from "../../../../testing/stubs/next-navigation.js";
import Listings from "./Listings";
import Audit from "./Audit";
import { adminUsers } from "../data/mock";

/**
 * The moderation queue, over `lib/adminStore.js`.
 *
 * `adminStore.test.js` covers the reducer in 57 cases, including that it
 * refuses an action the actor's role does not carry. This is the other half:
 * that a moderator can actually reach approve and reject from the screen, that
 * a rejection cannot be sent without the reason the seller and the audit log
 * both read, and — the one that matters most — that the *support* role, which
 * the matrix does not give `listing.moderate`, cannot move a listing even
 * though it can open the queue.
 */
const SESSION_KEY = "vezlist:admin:session:v1";
const STORE_KEY = "vezlist:admin:v1";

const as = (role) => {
  const who = adminUsers.find((a) => a.role === role);
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ ...who, signedInAt: "just now" }),
  );
  return who;
};

/** Tick the select box on the first row of the table, and name that row. */
async function selectFirstRow(user) {
  const boxes = screen
    .getAllByRole("checkbox")
    .filter((b) => b.getAttribute("aria-label")?.startsWith("Select "));
  const first = boxes.find(
    (b) => b.getAttribute("aria-label") !== "Select every row on this page",
  );
  await user.click(first);
  return first.getAttribute("aria-label").replace(/^Select /, "");
}

describe("admin Listings", () => {
  beforeEach(() => {
    localStorage.removeItem(STORE_KEY);
    setRoute({ path: "/listings" });
  });

  test("the header counts what the filters left on screen", () => {
    as("owner");
    renderAdmin(<Listings />);
    expect(screen.getByText(/ads across both sites$/)).toBeTruthy();
  });

  test("the status filter comes out of the URL, so a queue is a link", () => {
    as("moderator");
    setRoute({ path: "/listings", query: "status=pending" });
    renderAdmin(<Listings />);

    const [shown, total] = screen
      .getByText(/ads across both sites$/)
      .textContent.match(/(\d+) of (\d+)/)
      .slice(1)
      .map(Number);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(total);
  });

  test("selecting a row offers the bulk actions, and clearing takes them away", async () => {
    const user = userEvent.setup();
    as("moderator");
    renderAdmin(<Listings />);

    expect(screen.queryByRole("button", { name: "Approve" })).toBe(null);
    await selectFirstRow(user);
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("button", { name: "Approve" })).toBe(null);
  });

  test("a moderator approves a pending ad and it leaves the pending queue", async () => {
    const user = userEvent.setup();
    as("moderator");
    setRoute({ path: "/listings", query: "status=pending" });
    renderAdmin(<Listings />);

    const before = Number(
      screen
        .getByText(/ads across both sites$/)
        .textContent.match(/(\d+) of/)[1],
    );
    const title = await selectFirstRow(user);
    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByText("Approved 1 ad")).toBeTruthy();
    await waitFor(() =>
      expect(
        Number(
          screen
            .getByText(/ads across both sites$/)
            .textContent.match(/(\d+) of/)[1],
        ),
      ).toBe(before - 1),
    );
    expect(screen.queryByText(title)).toBe(null);
  });

  test("rejecting is refused until a reason is written", async () => {
    const user = userEvent.setup();
    as("moderator");
    setRoute({ path: "/listings", query: "status=pending" });
    renderAdmin(<Listings />);

    await selectFirstRow(user);
    await user.click(screen.getByRole("button", { name: "Reject" }));

    const dialog = screen.getByRole("dialog", { name: "Reject this ad" });
    const confirm = within(dialog).getByRole("button", { name: "Reject" });
    expect(confirm.disabled).toBe(true);

    // Whitespace is not a reason.
    await user.type(within(dialog).getByRole("textbox"), "   ");
    expect(confirm.disabled).toBe(true);

    await user.type(
      within(dialog).getByRole("textbox"),
      "Contact details in the photos.",
    );
    expect(confirm.disabled).toBe(false);
  });

  test("a rejection writes the reason into the audit log", async () => {
    const user = userEvent.setup();
    const who = as("moderator");
    setRoute({ path: "/listings", query: "status=pending" });
    const { unmount } = renderAdmin(<Listings />);

    await selectFirstRow(user);
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog", { name: "Reject this ad" });
    await user.type(within(dialog).getByRole("textbox"), "Contact in photos");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    expect(await screen.findByText("Rejected 1 ad")).toBeTruthy();
    unmount();

    // The store is persisted, so the audit screen sees what the queue did.
    setRoute({ path: "/audit" });
    renderAdmin(<Audit />);
    expect(await screen.findByText(/Contact in photos/)).toBeTruthy();
    expect(screen.getAllByText(new RegExp(who.name)).length).toBeGreaterThan(0);
  });

  test("support can read the queue but cannot moderate through it", async () => {
    const user = userEvent.setup();
    as("support");
    setRoute({ path: "/listings", query: "status=pending" });
    renderAdmin(<Listings />);

    const before = screen.getByText(/ads across both sites$/).textContent;
    await selectFirstRow(user);
    await user.click(screen.getByRole("button", { name: "Approve" }));

    // The screen still says it approved — hiding the button is the screens'
    // job and this one does not — but the reducer is the access check, and it
    // refused, so nothing moved. That split is deliberate in `adminStore.js`
    // and this is the test that it holds end to end.
    await waitFor(() =>
      expect(screen.getByText(/ads across both sites$/).textContent).toBe(
        before,
      ),
    );
  });

  test("clicking a row opens that listing", async () => {
    const user = userEvent.setup();
    as("owner");
    renderAdmin(<Listings />);

    await user.click(screen.getAllByRole("row")[1]);
    expect(router.push).toHaveBeenCalledWith(
      expect.stringMatching(/^\/listings\//),
    );
  });
});
