"use client";

import { createContext, useContext, useEffect } from "react";
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
 */
const DiscreetContext = createContext([false, () => {}]);

export function DiscreetProvider({ children }) {
  const [on, setOn] = usePersistedFlag("vezlist:discreet");

  useEffect(() => {
    document.documentElement.dataset.discreet = on ? "on" : "off";
  }, [on]);

  return (
    <DiscreetContext.Provider value={[on, setOn]}>
      {children}
    </DiscreetContext.Provider>
  );
}

export const useDiscreet = () => useContext(DiscreetContext);
