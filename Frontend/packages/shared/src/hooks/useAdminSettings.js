import { useEffect, useState } from "react";
import { getAdminSettings } from "../lib/api/adminSettings.js";

export const DEFAULT_QUEUE_TARGETS = { reviewSlaHours: 2, reportSlaHours: 48, ticketSlaHours: 24 };

/** Queue screens refresh targets on mount and on return to the tab. */
export function useAdminSettings() {
  const [settings, setSettings] = useState(DEFAULT_QUEUE_TARGETS);
  useEffect(() => {
    let active = true;
    const refresh = () => getAdminSettings().then((data) => {
      if (active) setSettings(data);
    }).catch(() => {});
    refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, []);
  return settings;
}
