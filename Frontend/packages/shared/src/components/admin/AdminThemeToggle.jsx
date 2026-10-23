"use client";

import { Moon, Sun } from "lucide-react";
import { useAdminTheme } from "../../context/AdminThemeContext.jsx";

export default function AdminThemeToggle({ className = "" }) {
  const context = useAdminTheme();
  if (!context) return null;
  const dark = context.theme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  const Glyph = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={context.toggle}
      aria-label={label}
      title={label}
      className={`grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface text-ink transition-colors hover:bg-canvas ${className}`}
    >
      <Glyph className="size-5" aria-hidden="true" />
    </button>
  );
}
