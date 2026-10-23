import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Settings from "./Settings";
import * as usersApi from "../lib/api/users";
const state = vi.hoisted(() => ({ toast: vi.fn(), signOut: vi.fn(), navigate: vi.fn() }));
vi.mock("../lib/sites", () => ({ IS_PERSONALS: true, SITE_NAME: "Personals" }));
vi.mock("../components/layout/SubPageBar", () => ({ default: () => null }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ signOut: state.signOut }) }));
vi.mock("../context/AccountContext", () => ({ useAccount: () => ({ role: "creator", roleMeta: { label: "Ads creator" }, setRole: vi.fn() }) }));
vi.mock("../context/ToastContext", () => ({ useToast: () => state.toast }));
vi.mock("../context/SavedContext", () => ({ useSaved: () => ({ ids: [], remove: vi.fn() }) }));
vi.mock("../context/StatusContext", () => ({ useStatus: () => ({ clearSeen: vi.fn() }) }));
vi.mock("../context/ReportsContext", () => ({ useReports: () => ({ reports: [], blocked: [], unblock: vi.fn(), clear: vi.fn() }) }));
vi.mock("../lib/nav", () => ({ useNavigate: () => state.navigate }));
vi.mock("../lib/persisted", () => ({ usePersistedObject: () => [null, vi.fn(), null, vi.fn()] }));
vi.mock("../lib/api/users", () => ({ getPreferences: vi.fn(), updatePreferences: vi.fn(), updateAdLocation: vi.fn(), requestAccountDeletion: vi.fn() }));
const prefs = { pushNotifications: true, emailUpdates: false, showPhoneOnAds: true, preciseLocation: false, availableNow: false, availableUntil: null, adLocationSet: false };
const flush = () => act(async () => { await Promise.resolve(); });
beforeEach(() => {
  vi.clearAllMocks();
  usersApi.getPreferences.mockResolvedValue({ ...prefs });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: vi.fn() } });
});
afterEach(() => { vi.useRealTimers(); });

test("availability switches off at its server deadline without extending it", async () => {
  vi.useFakeTimers();
  const start = new Date("2026-10-23T12:00:00Z");
  vi.setSystemTime(start);
  usersApi.getPreferences.mockResolvedValue({ ...prefs, availableNow: true, availableUntil: "2026-10-23T12:20:00Z" });
  render(<Settings />);
  await flush();
  const toggle = screen.getByRole("switch", { name: "Available now" });
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(screen.getByText("Available for 20 more minutes")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(20 * 60 * 1000); });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(usersApi.updatePreferences).not.toHaveBeenCalled();
});

test("changing another preference never sends or renews availability", async () => {
  const active = { ...prefs, availableNow: true, availableUntil: new Date(Date.now() + 600000).toISOString() };
  usersApi.getPreferences.mockResolvedValue(active);
  usersApi.updatePreferences.mockResolvedValue({ ...active, showPhoneOnAds: false });
  render(<Settings />);
  await waitFor(() => expect(screen.getByRole("switch", { name: "Show phone on ads" }).disabled).toBe(false));
  fireEvent.click(screen.getByRole("switch", { name: "Show phone on ads" }));
  await waitFor(() => expect(usersApi.updatePreferences).toHaveBeenCalledOnce());
  expect(usersApi.updatePreferences.mock.calls[0][0]).not.toHaveProperty("availableNow");
  expect(usersApi.updatePreferences.mock.calls[0][0]).not.toHaveProperty("availableUntil");
});

test("ad location is requested and saved only after explicit map disclosure confirmation", async () => {
  navigator.geolocation.getCurrentPosition.mockImplementation((success) => success({ coords: { latitude: 43.7, longitude: -79.4 } }));
  usersApi.updateAdLocation.mockResolvedValue({ ...prefs, preciseLocation: true, adLocationSet: true });
  render(<Settings />);
  await waitFor(() => expect(screen.getByRole("switch", { name: "Precise location" }).disabled).toBe(false));
  expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("switch", { name: "Precise location" }));
  const dialog = screen.getByRole("dialog", { name: "Share your ad location?" });
  expect(within(dialog).getByText(/visible on the map for all your existing and future ads on both boards/)).toBeTruthy();
  expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Use my location" }));
  await waitFor(() => expect(usersApi.updateAdLocation).toHaveBeenCalledWith({ latitude: 43.7, longitude: -79.4 }));
  expect(await screen.findByRole("button", { name: "Update ad location" })).toBeTruthy();
});

test("denied geolocation keeps sharing off and does not save invented coordinates", async () => {
  navigator.geolocation.getCurrentPosition.mockImplementation((success, fail) => fail({ code: 1 }));
  render(<Settings />);
  await waitFor(() => expect(screen.getByRole("switch", { name: "Precise location" }).disabled).toBe(false));
  fireEvent.click(screen.getByRole("switch", { name: "Precise location" }));
  fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith("Allow location access in your browser, then try again."));
  expect(usersApi.updateAdLocation).not.toHaveBeenCalled();
  expect(screen.getByRole("switch", { name: "Precise location" }).getAttribute("aria-checked")).toBe("false");
});


test("failed logout stays on settings and a successful retry redirects", async () => {
  state.signOut.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce();
  render(<Settings />);
  await flush();
  fireEvent.click(screen.getByRole("button", { name: "Log Out" }));
  let dialog = screen.getByRole("dialog", { name: "Log out?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Log out" }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith("Couldn't log out. Please try again."));
  expect(state.navigate).not.toHaveBeenCalled();
  dialog = screen.getByRole("dialog", { name: "Log out?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Log out" }));
  await waitFor(() => expect(state.navigate).toHaveBeenCalledWith("/login", { replace: true }));
});
