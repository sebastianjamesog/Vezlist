import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AdminThemeProvider } from "./AdminThemeContext.jsx";
import AdminThemeToggle from "../components/admin/AdminThemeToggle.jsx";
import { ADMIN_THEME_KEY, ADMIN_THEME_INIT } from "../lib/adminTheme.js";

let media;
let systemChanged;
beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.adminTheme;
  media = {
    matches: false,
    addEventListener: vi.fn((_, callback) => {
      systemChanged = callback;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.adminTheme;
});
const mount = () =>
  render(
    <AdminThemeProvider>
      <AdminThemeToggle />
    </AdminThemeProvider>,
  );

test("saved theme is applied before hydration and restored by the toggle", () => {
  localStorage.setItem(ADMIN_THEME_KEY, "dark");
  window.eval(ADMIN_THEME_INIT);
  expect(document.documentElement.dataset.adminTheme).toBe("dark");
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
  expect(localStorage.getItem(ADMIN_THEME_KEY)).toBe("light");
  expect(document.documentElement.dataset.adminTheme).toBe("light");
});

test("system preference is followed until the admin chooses a mode", () => {
  media.matches = true;
  mount();
  expect(document.documentElement.dataset.adminTheme).toBe("dark");
  act(() => {
    media.matches = false;
    systemChanged();
  });
  expect(document.documentElement.dataset.adminTheme).toBe("light");
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  act(() => systemChanged());
  expect(document.documentElement.dataset.adminTheme).toBe("dark");
});

test("other admin tabs sync preferences and storage failures do not break switching", () => {
  mount();
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: ADMIN_THEME_KEY, newValue: "dark" }),
    ),
  );
  expect(document.documentElement.dataset.adminTheme).toBe("dark");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
  expect(document.documentElement.dataset.adminTheme).toBe("light");
});

test("invalid saved values and blocked reads fall back to system mode", () => {
  localStorage.setItem(ADMIN_THEME_KEY, "invalid");
  media.matches = true;
  window.eval(ADMIN_THEME_INIT);
  expect(document.documentElement.dataset.adminTheme).toBe("dark");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  mount();
  expect(document.documentElement.dataset.adminTheme).toBe("dark");
});
