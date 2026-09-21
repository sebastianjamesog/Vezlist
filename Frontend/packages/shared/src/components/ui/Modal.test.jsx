import { describe, expect, test, vi } from "vitest";
import { useState } from "react";
import {
  render,
  screen,
  userEvent,
  within,
} from "../../../../../testing/render.jsx";
import Modal from "./Modal";

/**
 * `useDialogFocus` guards 19 dialogs and had no test. These are its tests, run
 * through `Modal` rather than against the hook directly — the hook's whole job
 * is what happens to the *document* when a dialog opens, so calling it in
 * isolation would assert on nothing that matters.
 */

/** A page with a trigger, some background links, and a modal over it. */
function Harness({ children, ...props }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <a href="/before">before</a>
      <button onClick={() => setOpen(true)}>Open</button>
      <a href="/after">after</a>
      <Modal
        open={open}
        title="Filters"
        onClose={() => setOpen(false)}
        {...props}
      >
        {children}
      </Modal>
    </div>
  );
}

const openIt = async (user) =>
  user.click(screen.getByRole("button", { name: "Open" }));

describe("Modal", () => {
  test("renders nothing at all while closed", () => {
    render(
      <Modal open={false} title="Filters" onClose={() => {}}>
        <button>Inside</button>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBe(null);
    expect(screen.queryByRole("button", { name: "Inside" })).toBe(null);
  });

  test("names itself with its title, and its subtitle describes it", () => {
    render(
      <Modal
        open
        title="Filters"
        subtitle="Narrow the board"
        onClose={() => {}}
      >
        <span />
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const described = document.getElementById(
      dialog.getAttribute("aria-describedby"),
    );
    expect(described.textContent).toBe("Narrow the board");
  });

  test("opening moves focus into the dialog", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <button>Inside</button>
      </Harness>,
    );
    await openIt(user);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(
      true,
    );
  });

  test("a field marked autofocus wins over the panel", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input autoFocus aria-label="Reason" />
      </Harness>,
    );
    await openIt(user);
    expect(document.activeElement).toBe(screen.getByLabelText("Reason"));
  });

  test("the background goes inert while it is open, and comes back after", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <button>Inside</button>
      </Harness>,
    );
    const before = screen.getByRole("link", { name: "before" });
    expect(before.hasAttribute("inert")).toBe(false);

    await openIt(user);
    expect(before.hasAttribute("inert")).toBe(true);

    await user.keyboard("{Escape}");
    expect(before.hasAttribute("inert")).toBe(false);
  });

  test("Tab cycles inside the dialog instead of escaping to the page", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <button>First</button>
        <button>Second</button>
      </Harness>,
    );
    await openIt(user);

    const dialog = screen.getByRole("dialog");
    const first = within(dialog).getByRole("button", { name: "Close" });
    const second = within(dialog).getByRole("button", { name: "First" });
    const last = within(dialog).getByRole("button", { name: "Second" });

    // Focus starts on the panel, which is not itself a stop; the first Tab
    // enters at the top of the cycle.
    await user.tab();
    expect(document.activeElement).toBe(first);
    await user.tab();
    expect(document.activeElement).toBe(second);
    await user.tab();
    expect(document.activeElement).toBe(last);

    // Off the end wraps to the start rather than reaching the page behind.
    await user.tab();
    expect(document.activeElement).toBe(first);
  });

  test("Shift+Tab off the first stop wraps to the last", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <button>Only</button>
      </Harness>,
    );
    await openIt(user);

    const dialog = screen.getByRole("dialog");
    await user.tab();
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Close" }),
    );
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Only" }),
    );
  });

  test("Escape closes it", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open title="Filters" onClose={onClose}>
        <button>Inside</button>
      </Modal>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("clicking the scrim closes it; clicking the panel does not", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open title="Filters" onClose={onClose}>
        <button>Inside</button>
      </Modal>,
    );
    await user.click(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();

    // The scrim is `aria-hidden`, so it is addressed the way a pointer
    // addresses it — by position in the tree — rather than by role.
    const scrim = screen.getByRole("dialog").parentElement.firstElementChild;
    await user.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("closing returns focus to whatever opened it", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <button>Inside</button>
      </Harness>,
    );
    const trigger = screen.getByRole("button", { name: "Open" });
    await openIt(user);
    expect(document.activeElement).not.toBe(trigger);

    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
  });

  test("a footer renders below the body", () => {
    render(
      <Modal
        open
        title="Filters"
        onClose={() => {}}
        footer={<button>Apply</button>}
      >
        <span>Body</span>
      </Modal>,
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeTruthy();
  });
});
