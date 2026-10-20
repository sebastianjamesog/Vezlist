import { beforeEach, expect, test, vi } from "vitest";
import { renderAdmin, screen, userEvent, waitFor } from "../../../../testing/render.jsx";
import Settings from "./Settings.jsx";
import * as api from "../lib/api/adminSettings.js";
import * as auth from "../lib/api/auth.js";
vi.mock("../lib/api/adminSettings.js", () => ({ getAdminSettings: vi.fn(), updateAdminSettings: vi.fn() }));
vi.mock("../lib/api/auth.js", () => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn() }));
const initial = { ageGateTitle: "Adults", ageGateBody: "Adult content", reviewSlaHours: 2, reportSlaHours: 48, ticketSlaHours: 24, version: 1 };
beforeEach(() => { vi.resetAllMocks(); auth.me.mockResolvedValue({ id: "admin", name: "Admin", roles: ["ADMIN"] }); api.getAdminSettings.mockResolvedValue(initial); });
test("saves settings through the backend and keeps the current version", async () => {
  api.updateAdminSettings.mockResolvedValue({ ...initial, ageGateTitle: "Adults only", version: 2 });
  renderAdmin(<Settings />);
  const heading = await screen.findByLabelText("Heading");
  await userEvent.clear(heading); await userEvent.type(heading, "Adults only");
  await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(api.updateAdminSettings).toHaveBeenCalledWith({ ...initial, ageGateTitle: "Adults only" }));
  expect(await screen.findByText(/Settings saved/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Reset the console/ })).toBeNull();
});
test("a stale save preserves the draft and requires loading current server values", async () => {
  api.updateAdminSettings.mockRejectedValue({ status: 409 });
  renderAdmin(<Settings />);
  await screen.findByLabelText("Heading");
  await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/Settings changed/);
  expect(screen.getByRole("button", { name: "Save settings" }).disabled).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Reload settings" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save settings" }).disabled).toBe(false));
});
