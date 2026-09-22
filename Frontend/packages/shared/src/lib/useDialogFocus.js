"use client";

import { useEffect, useRef } from "react";

/**
 * Everything the browser might hand a Tab to, before we filter it.
 *
 * `[tabindex]` is listed without a value test because the value is checked
 * afterwards against the live `tabIndex` property — that resolves the implicit
 * default for links and buttons as well as the explicit attribute, so one pass
 * covers both.
 */
const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "details > summary",
  "iframe",
  "audio[controls]",
  "video[controls]",
  '[contenteditable]:not([contenteditable="false"])',
  "[tabindex]",
].join(",");

/**
 * The tab stops inside the dialog, in document order.
 *
 * Two filters matter beyond the selector. `tabIndex >= 0` drops anything held
 * out of the order deliberately — the panel itself carries `tabIndex={-1}` so
 * that it can take focus without ever becoming a stop on the cycle. The rect
 * test drops what is rendered but not shown: `ConfirmDialog` passes
 * `bodyClassName="hidden"`, which makes its body `display: none`, and the
 * placeholder inside it must not be allowed to swallow the first Tab.
 */
function tabStops(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.closest("[inert]") &&
      (el.offsetWidth || el.offsetHeight || el.getClientRects().length),
  );
}

/**
 * Nodes that never get `inert`, either because the attribute means nothing on
 * them or because marking them would break the tooling that owns them.
 */
const NEVER_INERT = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "TEMPLATE",
  "HEAD",
  "NEXTJS-PORTAL",
]);

/**
 * Take the rest of the page out of the tab order and off the accessibility
 * tree, without taking the dialog out with it.
 *
 * The dialogs here are not portalled — they render where they are written,
 * which on mobile is inside `<main>`, so that `absolute inset-0` lands on the
 * phone shell rather than on the window. That rules out the obvious version of
 * this ("mark the app root inert"), because the app root is an *ancestor* of
 * the dialog and `inert` inherits down. So the walk goes from the dialog up to
 * `<body>` marking every sibling it passes: the ancestor chain stays live,
 * everything hanging off it does not, and what remains reachable is exactly the
 * dialog — the same result inerting a root would give, computed from the other
 * direction.
 *
 * Only elements this call actually changed are recorded, so a second dialog
 * opening over a first cannot, on its way out, un-inert what the first one had
 * already hidden.
 *
 * One consequence is worth stating rather than discovering. `BottomNav` sits at
 * `z-[1001]`, one above the sheets, so on mobile the tab bar currently paints
 * *over* an open dialog's scrim and stays tappable: with a filter sheet up you
 * can tap Saved and navigate out from under it. That is the reachable
 * background this change exists to close, so the bar goes inert with everything
 * else. It also means the plus — which wears an X while a create layer is up
 * and toggles it shut — stops answering taps while the chooser is open. Three
 * ways out remain (the sheet's own X, Escape, the scrim), and a dismiss control
 * floating above a modal scrim is the thing to reconsider next; it is not worth
 * keeping four background nav links live to preserve it.
 */
function inertOutside(root) {
  const touched = [];

  for (
    let node = root;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const parent = node.parentElement;
    if (!parent) break;

    for (const sibling of parent.children) {
      if (sibling === node) continue;
      if (NEVER_INERT.has(sibling.nodeName)) continue;
      if (sibling.hasAttribute("inert")) continue;
      sibling.setAttribute("inert", "");
      touched.push(sibling);
    }
  }

  return touched;
}

/**
 * The four things a dialog owes a keyboard, in one hook: Escape, a trap, a
 * place to land, and a way back.
 *
 * `AgeGate` already did the declarative half of this by hand — `role="dialog"`,
 * `aria-labelledby`, an `autoFocus` target, and `inert` on the board behind it.
 * This is that pattern with the parts that cannot be written as attributes (the
 * trap, and the return to whatever opened the thing) filled in, so that every
 * sheet in the app inherits it rather than the one screen that was written
 * carefully.
 *
 * Attach the returned ref to the outermost node of the dialog — the positioning
 * wrapper, scrim included. The scrim has to stay outside the trap so that
 * clicking it still closes; the trap scopes itself to the `[role="dialog"]`
 * panel found within.
 *
 * Native `<dialog>.showModal()` would give the trap and the restore for free,
 * and it is the right answer for a dialog that belongs to the viewport. It is
 * the wrong answer here. `showModal` promotes the element into the top layer,
 * where `position: absolute` resolves against the initial containing block. The
 * mobile layout of both sheets is `absolute inset-0 … pb-nav` *inside the
 * 430px phone shell*, deliberately sitting above the bottom nav and clipped by
 * the shell's `overflow-hidden`; in the top layer all three of those go away
 * and the sheet spans the whole window instead. The scrim, its blur and the
 * `lg:` centred-dialog variant would all have to be rebuilt against
 * `::backdrop`. That is a redesign of the shell, not an accessibility fix, so
 * the trap is done in JS and the layout is left exactly where it was.
 */
export function useDialogFocus(open, onClose) {
  const ref = useRef(null);

  // Every call site passes an inline arrow, so `onClose` is a new function on
  // every render. Depending on it directly would tear the whole trap down and
  // set it up again mid-render — which now means restoring focus to the trigger
  // and stealing it back on every keystroke in an admin form. The handler is
  // read through a ref instead, and the effect keys on `open` alone.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const root = ref.current;
    if (!open || !root) return;

    const panel = root.querySelector('[role="dialog"]') ?? root;

    // Whatever opened this is what closing it should return to. Captured before
    // we move focus, and re-checked on the way out, because a dialog opened
    // from a row that the dialog itself then deletes has no trigger left.
    const trigger = document.activeElement;

    const inerted = inertOutside(root);

    // Do not fight `autoFocus`. React applies it during commit, so a dialog
    // with a text field in it already has focus in the right place by the time
    // this runs — and nine admin dialogs rely on exactly that. Only when focus
    // is still outside do we place it: on the declared target if there is one,
    // and otherwise on the panel, which is what a screen reader wants, since
    // the dialog then announces itself by its own label.
    if (!panel.contains(document.activeElement)) {
      (panel.querySelector("[autofocus]") ?? panel).focus();
    }

    function onKey(e) {
      if (e.key === "Escape") {
        close.current();
        return;
      }
      if (e.key !== "Tab") return;

      const stops = tabStops(panel);
      if (stops.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;

      // Focus resting on the panel itself, or lost outside it altogether,
      // enters at whichever end the direction of travel implies.
      if (!panel.contains(active) || active === panel) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      for (const el of inerted) el.removeAttribute("inert");
      if (trigger?.isConnected && typeof trigger.focus === "function") {
        trigger.focus();
      }
    };
  }, [open]);

  return ref;
}
