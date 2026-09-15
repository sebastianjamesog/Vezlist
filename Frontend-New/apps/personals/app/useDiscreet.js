"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { usePersistedFlag } from "@vezlist/shared/lib/persisted.js";

/**
 * Discreet mode: blur every photo until you ask for it — for reading the board
 * somewhere with people around.
 *
 * The switch is an attribute on <html> and one CSS rule rather than a prop
 * threaded through the tree, because media shows up in the feed, the story rail
 * and the ad gallery, and none of those should have to know this exists.
 *
 * It is set from the root layout, not from the board: the ad gallery is a page
 * of its own, and loading one directly has to come up blurred too.
 *
 * THE PROMISE THIS MAKES, STATED PLAINLY: this is a visual blur, not a
 * withholding of media. The photo is still in the DOM and still fetched —
 * discreet mode changes what it looks like on screen, not whether the data
 * exists. Genuinely withholding media (not requesting it at all until
 * revealed) would mean every place that renders a `data-media` image — the
 * feed cards, the story rail, the ad gallery, the live cover — stops setting
 * `src` until reveal, which is a change to those render sites, not to this
 * switch. That is real, worthwhile follow-up work; it is not done here, and
 * the UI (the toggle's "Blur photos" label, this comment) says "blur" rather
 * than "hide" or "private" so nobody reads a stronger guarantee into it than
 * the one it keeps — the exact gap this feature was flagged for.
 *
 * What this file *does* own and keep honest:
 *  - the blur is applied before the first paint, from an inline script in the
 *    root layout that runs ahead of hydration (see `beforeInteractive` in
 *    layout.jsx) — a blur that lands after the image has already been shown
 *    for one frame is not a blur, it's a leak with a delay.
 *  - the browser tab (title, favicon) stays neutral for as long as discreet
 *    mode is on, so a glance at the tab strip doesn't say what this is.
 */
export const DISCREET_STORAGE_KEY = "vezlist:discreet";

const NEUTRAL_TITLE = "New Tab";
const NEUTRAL_FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="7" fill="#c7cdd6"/></svg>';
const NEUTRAL_FAVICON = `data:image/svg+xml,${encodeURIComponent(NEUTRAL_FAVICON_SVG)}`;

const DiscreetContext = createContext([false, () => {}]);

/**
 * Keeps the tab strip neutral while discreet mode is on: an overwritten
 * document title and favicon, restored the moment it's switched off.
 *
 * Next re-renders <title> on every client-side navigation (and could touch
 * the icon links too), so a one-shot overwrite would only last until the next
 * tap into another ad — a MutationObserver keeps stomping it back to neutral
 * for as long as `on` stays true, rather than trusting a single write.
 */
function useNeutralChrome(on) {
  const savedTitle = useRef(null);
  const savedIcons = useRef(null);

  useEffect(() => {
    if (!on) {
      if (savedTitle.current !== null) {
        document.title = savedTitle.current;
        savedTitle.current = null;
      }
      if (savedIcons.current) {
        for (const [el, href] of savedIcons.current) {
          if (href === null) el.removeAttribute("href");
          else el.setAttribute("href", href);
        }
        savedIcons.current = null;
      }
      return;
    }

    if (savedTitle.current === null) savedTitle.current = document.title;
    document.title = NEUTRAL_TITLE;

    const iconEls = document.querySelectorAll(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
    );
    if (!savedIcons.current) {
      savedIcons.current = new Map(
        Array.from(iconEls, (el) => [el, el.getAttribute("href")]),
      );
    }
    for (const el of iconEls) el.setAttribute("href", NEUTRAL_FAVICON);

    const titleEl = document.querySelector("title");
    const observer = titleEl
      ? new MutationObserver(() => {
          if (document.title !== NEUTRAL_TITLE) document.title = NEUTRAL_TITLE;
        })
      : null;
    observer?.observe(titleEl, { childList: true });

    return () => observer?.disconnect();
  }, [on]);
}

export function DiscreetProvider({ children }) {
  const [on, setOn] = usePersistedFlag(DISCREET_STORAGE_KEY);

  useEffect(() => {
    document.documentElement.dataset.discreet = on ? "on" : "off";
  }, [on]);

  useNeutralChrome(on);

  return (
    <DiscreetContext.Provider value={[on, setOn]}>
      {children}
    </DiscreetContext.Provider>
  );
}

export const useDiscreet = () => useContext(DiscreetContext);
