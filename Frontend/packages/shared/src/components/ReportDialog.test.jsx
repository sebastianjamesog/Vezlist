import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  renderApp,
  screen,
  userEvent,
  within,
} from "../../../../testing/render.jsx";
import ReportDialog from "./ReportDialog";
import { MAX_DETAIL, reasonsFor } from "../lib/reports";
import * as moderationApi from "../lib/api/moderation.js";

/**
 * Reporting, over `lib/reports.js` and, for a `listing` target only, the
 * real `POST /listings/{id}/reports` (see `ReportDialog.jsx`'s own comment
 * for why only that target type has a backend endpoint at all). Every
 * network call is mocked at the `lib/api/moderation.js` boundary — this is
 * a test of the dialog's wiring, not of the HTTP client.
 *
 * `reports.test.js` covers `buildReport` and the reducer. What only the
 * dialog can show is that the two rules the reducer enforces are also
 * *said* — a reason is required, and "Something else" is not accepted with
 * nothing under it — that a `listing` report's confirmation truthfully says
 * it reached a moderator, and that a `user`/`stream` report's confirmation
 * — which still has no backend endpoint — does not claim that.
 */
vi.mock("../lib/api/moderation.js", () => ({
  reportListing: vi.fn(),
}));

beforeEach(() => {
  moderationApi.reportListing.mockReset();
  moderationApi.reportListing.mockResolvedValue({ id: "receipt-1" });
});

const open = (props = {}) =>
  renderApp(
    <ReportDialog
      open
      targetType="listing"
      targetId="l1"
      targetLabel="Solid Oak Dining Table"
      onClose={props.onClose ?? (() => {})}
      {...props}
    />,
  );

describe("ReportDialog", () => {
  test("offers the reasons this target type has, and no others", () => {
    open({ targetType: "user" });
    const group = screen.getByRole("radiogroup", { name: "Reason" });
    const offered = within(group)
      .getAllByRole("radio")
      .map((r) => r.textContent);

    expect(offered).toEqual(reasonsFor("user").map((r) => r.label));
    // A listing-only reason has no meaning against a person.
    expect(offered).not.toContain("Duplicate posting");
  });

  test("submitting with no reason picked says so and files nothing", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByRole("alert").textContent).toBe("Pick a reason.");
    expect(screen.queryByText("Report recorded")).toBe(null);
  });

  test("'Something else' will not go through without a written detail", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("radio", { name: "Something else" }));
    await user.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByRole("alert").textContent).toMatch(
      /needs a line of detail/,
    );

    await user.type(
      screen.getByRole("textbox"),
      "The photos are of a different flat.",
    );
    await user.click(screen.getByRole("button", { name: "Report" }));
    // The default target here is "listing", so submitting now awaits the
    // real POST /listings/{id}/reports (mocked above) before the
    // confirmation appears — hence `findByRole` rather than `getByRole`.
    expect(
      await screen.findByRole("dialog", { name: "Report sent" }),
    ).toBeTruthy();
  });

  test("picking a reason clears the complaint about not having picked one", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.queryByRole("alert")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Scam or fraud" }));
    expect(screen.queryByRole("alert")).toBe(null);
  });

  test("the detail field is capped, and says how much is left", async () => {
    const user = userEvent.setup();
    open();

    const box = screen.getByRole("textbox");
    expect(box.maxLength).toBe(MAX_DETAIL);
    await user.type(box, "abcde");
    expect(screen.getByText(new RegExp(`${MAX_DETAIL - 5} left`))).toBeTruthy();
  });

  test("a listing report's confirmation truthfully says it reached a moderator", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("radio", { name: "Scam or fraud" }));
    await user.click(screen.getByRole("button", { name: "Report" }));

    const done = await screen.findByRole("dialog", { name: "Report sent" });
    expect(done.textContent).toMatch(/received this report/i);
    expect(moderationApi.reportListing).toHaveBeenCalledWith(
      "l1",
      expect.objectContaining({ reason: "FRAUD" }),
    );
  });

  test("a user report's confirmation says it has not reached a moderator — there is no endpoint for it", async () => {
    const user = userEvent.setup();
    open({ targetType: "user", targetId: "s1", targetLabel: "A seller" });

    await user.click(screen.getByRole("radio", { name: "Scam or fraud" }));
    await user.click(screen.getByRole("button", { name: "Report" }));

    const done = screen.getByRole("dialog", { name: "Report recorded" });
    expect(done.textContent).toMatch(/not.{0,3} been sent to a moderator/i);
    expect(done.textContent).not.toMatch(/our team will review/i);
    expect(moderationApi.reportListing).not.toHaveBeenCalled();
  });

  test("a failed submission shows the error and stays on the form", async () => {
    moderationApi.reportListing.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("radio", { name: "Scam or fraud" }));
    await user.click(screen.getByRole("button", { name: "Report" }));

    expect((await screen.findByRole("alert")).textContent).toBe("network down");
    expect(screen.queryByRole("dialog", { name: "Report sent" })).toBe(null);
  });

  test("reporting the same thing twice shows the first report, not a second form", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { unmount } = open({ onClose });

    await user.click(screen.getByRole("radio", { name: "Scam or fraud" }));
    await user.click(screen.getByRole("button", { name: "Report" }));
    await user.click(await screen.findByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
    unmount();

    open();
    const again = await screen.findByRole("dialog", {
      name: "Already reported",
    });
    expect(again.textContent).toMatch(/Scam or fraud/);
    expect(screen.queryByRole("radiogroup", { name: "Reason" })).toBe(null);
  });

  test("a different target is still reportable after the first one", async () => {
    const user = userEvent.setup();
    const { unmount } = open();
    await user.click(screen.getByRole("radio", { name: "Scam or fraud" }));
    await user.click(screen.getByRole("button", { name: "Report" }));
    await screen.findByRole("dialog", { name: "Report sent" });
    unmount();

    open({ targetId: "l2", targetLabel: "A different ad" });
    expect(screen.getByRole("dialog", { name: "Report this" })).toBeTruthy();
  });
});
