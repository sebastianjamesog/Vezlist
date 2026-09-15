import { describe, expect, test, vi } from "vitest";
import {
  render,
  screen,
  userEvent,
  within,
} from "../../../../../testing/render.jsx";
import ConfirmDialog from "./ConfirmDialog";

/**
 * The yes/no gate in front of every irreversible thing — deleting an ad,
 * signing out, an owner removing an admin.
 *
 * The interesting part is that it is a `Modal` with `bodyClassName="hidden"`
 * and a placeholder `<span />` inside it, which is the exact case
 * `useDialogFocus`'s rect filter exists for: the placeholder is in the DOM,
 * inside a `display: none` body, and must never take the first Tab.
 */
describe("ConfirmDialog", () => {
  const open = (props = {}) =>
    render(
      <ConfirmDialog
        open
        title="Delete this ad?"
        body="This cannot be undone."
        onConfirm={props.onConfirm ?? (() => {})}
        onClose={props.onClose ?? (() => {})}
        {...props}
      />,
    );

  test("asks its question as the dialog's name, with the body describing it", () => {
    open();
    const dialog = screen.getByRole("dialog", { name: "Delete this ad?" });
    expect(within(dialog).getByText("This cannot be undone.")).toBeTruthy();
  });

  test("Confirm calls onConfirm and Cancel calls onClose", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    open({ onConfirm, onClose, confirmLabel: "Delete" });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("the confirm button is labelled by the caller, defaulting to Confirm", () => {
    const { unmount } = open();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy();
    unmount();

    open({ confirmLabel: "Sign out" });
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBe(null);
  });

  test("destructive changes how the confirm reads, not what it does", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    open({ destructive: true, confirmLabel: "Delete", onConfirm });

    const button = screen.getByRole("button", { name: "Delete" });
    // The danger variant is the only signal that this is the irreversible one,
    // so it is asserted rather than left to a screenshot.
    expect(button.className).toMatch(/red|danger/);
    await user.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("the hidden body's placeholder never takes a tab stop", async () => {
    const user = userEvent.setup();
    open({ confirmLabel: "Delete" });

    const dialog = screen.getByRole("dialog");
    const stops = ["Close", "Cancel", "Delete"].map((name) =>
      within(dialog).getByRole("button", { name }),
    );

    for (const stop of stops) {
      await user.tab();
      expect(document.activeElement).toBe(stop);
    }
    // Round the cycle rather than off into the page behind.
    await user.tab();
    expect(document.activeElement).toBe(stops[0]);
  });

  test("Escape closes without confirming", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    open({ onConfirm, onClose });

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("closed, it puts nothing in the document", () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Delete this ad?"
        body="This cannot be undone."
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
