"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ADMIN_THEME_KEY } from "../lib/adminTheme.js";

const AdminThemeContext = createContext(null);
const valid = (value) => value === "light" || value === "dark";

export function AdminThemeProvider({ children }) {
  const [theme, setTheme] = useState("light");
  const preference = useRef(null);

  function apply(next) {
    document.documentElement.dataset.adminTheme = next;
    setTheme(next);
  }

  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    try {
      const stored = localStorage.getItem(ADMIN_THEME_KEY);
      preference.current = valid(stored) ? stored : null;
    } catch {
      /* A blocked storage area should not prevent switching themes. */
    }
    const syncSystem = () =>
      apply(preference.current ?? (system.matches ? "dark" : "light"));
    const syncStorage = (event) => {
      if (event.key !== ADMIN_THEME_KEY && event.key !== null) return;
      preference.current = valid(event.newValue) ? event.newValue : null;
      syncSystem();
    };
    syncSystem();
    system.addEventListener("change", syncSystem);
    window.addEventListener("storage", syncStorage);
    return () => {
      system.removeEventListener("change", syncSystem);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  function toggle() {
    const next =
      document.documentElement.dataset.adminTheme === "dark" ? "light" : "dark";
    preference.current = next;
    apply(next);
    try {
      localStorage.setItem(ADMIN_THEME_KEY, next);
    } catch {
      /* Keep the session preference. */
    }
  }

  return (
    <AdminThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </AdminThemeContext.Provider>
  );
}

export const useAdminTheme = () => useContext(AdminThemeContext);
