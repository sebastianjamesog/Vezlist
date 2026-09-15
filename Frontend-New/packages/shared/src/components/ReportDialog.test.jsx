import { describe, expect, test, vi } from "vitest";
import {
  renderApp,
  screen,
  userEvent,
  within,
} from "../../../../testing/render.jsx";
import ReportDialog from "./ReportDialog";
import { MAX_DETAIL, reasonsFor } from "../lib/reports";

/**
 * Reporting, over `lib/reports.js`.
 *
 * `reports.test.js` covers `buildReport` and the reducer. What only the dialog
 * can show is that the two rules the reducer enforces are also *said* — a
 * reason is required, and "Something else" is not accepted with nothing under
 * it — and that the confirmation does not claim a moderator has the report.
 * That last one is not a style note: the console is a separate origin with a
 * separate store and nothing between them, and a dialog that said "sent to our
 * team" would be the defect this component's own comment is about.
 */
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
    expect(
      screen.getByRole("dialog", { name: "Report recorded" }),
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

  test("the confirmation says the report has not reached a moderator", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("radio", { name: "Scam or fraud" }));
    await user.click(screen.getByRole("button", { name: "Report" }));

    const done = screen.getByRole("dialog", { name: "Report recorded" });
    expect(done.textContent).toMatch(/not.{0,3} been sent to a moderator/i);
    expect(done.textContent).not.toMatch(/our team will review/i);
  });

  test("reporting the same thing twice shows the first report, not a second form", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { unmount } = open({ onClose });

    await user.click(screen.getByRole("radio", { name: "Scam or fraud" }));
    await user.click(screen.getByRole("button", { name: "Report" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
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
    unmount();

    open({ targetId: "l2", targetLabel: "A different ad" });
    expect(screen.getByRole("dialog", { name: "Report this" })).toBeTruthy();
  });
});
