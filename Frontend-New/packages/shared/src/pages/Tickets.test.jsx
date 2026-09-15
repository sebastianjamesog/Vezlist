import { beforeEach, describe, expect, test } from "vitest";
import {
  renderApp,
  screen,
  signIn,
  userEvent,
  waitFor,
  within,
} from "../../../../testing/render.jsx";
import { router, setRoute } from "../../../../testing/stubs/next-navigation.js";
import Tickets from "./Tickets";
import TicketDetail from "./TicketDetail";

/**
 * Support tickets, over `lib/tickets.js`.
 *
 * The store's own test proves `open` mints an id and files the thread. This
 * proves the two things only the screens can: that a ticket opened here is
 * readable on the detail route a moment later — the store landed precisely
 * because pushing into the imported mock left the detail page rendering an id
 * that did not exist — and that the compose form refuses an empty ticket
 * instead of filing a blank one.
 */
describe("Tickets", () => {
  beforeEach(() => {
    signIn({ role: "creator" });
    setRoute({ path: "/support/tickets" });
  });

  test("the tabs filter by status", async () => {
    const user = userEvent.setup();
    renderApp(<Tickets />);

    const all = screen.getAllByRole("link").length;
    await user.click(screen.getByRole("button", { name: "Resolved" }));
    const resolved = screen.queryAllByRole("link").length;
    expect(resolved).toBeLessThan(all);
    for (const link of screen.queryAllByRole("link")) {
      expect(link.textContent).toMatch(/Resolved/);
    }
  });

  test("an empty ticket is refused, field by field", async () => {
    const user = userEvent.setup();
    renderApp(<Tickets />);

    await user.click(screen.getByRole("button", { name: "New ticket" }));
    const sheet = screen.getByRole("dialog", { name: "New ticket" });
    await user.click(
      within(sheet).getByRole("button", { name: "Open ticket" }),
    );

    expect(within(sheet).getByText("Give it a subject.")).toBeTruthy();
    expect(within(sheet).getByText("Say what's going on.")).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  test("typing into a field clears its complaint", async () => {
    const user = userEvent.setup();
    renderApp(<Tickets />);

    await user.click(screen.getByRole("button", { name: "New ticket" }));
    const sheet = screen.getByRole("dialog", { name: "New ticket" });
    await user.click(
      within(sheet).getByRole("button", { name: "Open ticket" }),
    );

    await user.type(
      within(sheet).getByRole("textbox", { name: /^Subject/ }),
      "Refund",
    );
    expect(within(sheet).queryByText("Give it a subject.")).toBe(null);
    // The one still empty keeps saying so.
    expect(within(sheet).getByText("Say what's going on.")).toBeTruthy();
  });

  test("a ticket opened here is readable on its own route", async () => {
    const user = userEvent.setup();
    renderApp(<Tickets />);

    const before = screen.getAllByRole("link").length;
    await user.click(screen.getByRole("button", { name: "New ticket" }));
    const sheet = screen.getByRole("dialog", { name: "New ticket" });
    await user.type(
      within(sheet).getByRole("textbox", { name: "Subject" }),
      "Promotion never went live",
    );
    await user.type(
      within(sheet).getByRole("textbox", { name: "Message" }),
      "Spent sixty credits and the badge never appeared.",
    );
    await user.click(
      within(sheet).getByRole("button", { name: "Open ticket" }),
    );

    expect(await screen.findByText("Ticket opened")).toBeTruthy();
    expect(screen.getAllByRole("link").length).toBe(before + 1);

    // The screen navigated somewhere; go there and the thread is real. This is
    // the regression the store exists to prevent.
    const to = router.push.mock.calls.at(-1)[0];
    expect(to).toMatch(/^\/support\/tickets\//);

    setRoute({ path: to, params: { id: to.split("/").pop() } });
    renderApp(<TicketDetail />);
    await waitFor(() =>
      expect(
        screen.getAllByText(/Promotion never went live/).length,
      ).toBeGreaterThan(0),
    );
    expect(
      screen.getByText("Spent sixty credits and the badge never appeared."),
    ).toBeTruthy();
  });

  test("a ticket id that was never opened renders a screen, not a crash", () => {
    setRoute({ path: "/support/tickets/nope", params: { id: "nope" } });
    const { container } = renderApp(<TicketDetail />);
    expect(container.textContent.trim().length).toBeGreaterThan(0);
  });
});
