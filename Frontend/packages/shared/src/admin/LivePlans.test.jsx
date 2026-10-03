import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  renderAdmin,
  screen,
  userEvent,
  waitFor,
} from "../../../../testing/render.jsx";
import LivePlans from "./LivePlans";
import * as api from "../lib/api/livePlans.js";
import * as auth from "../lib/api/auth.js";

vi.mock("../lib/api/livePlans.js", () => ({
  listLivePlans: vi.fn(),
  createLivePlan: vi.fn(),
  updateLivePlan: vi.fn(),
}));
vi.mock("../lib/api/auth.js", () => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));
const plan = {
  id: "plan-1",
  name: "Quick session",
  durationMinutes: 10,
  price: 15,
  currency: "CAD",
  badge: null,
  enabled: true,
  sortOrder: 0,
  version: 3,
};

describe("Live plan administration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.me.mockResolvedValue({ id: "admin", name: "Admin", roles: ["ADMIN"] });
    api.listLivePlans.mockResolvedValue({ items: [plan] });
  });
  test("saves durations, prices, badges, availability, and current version", async () => {
    api.updateLivePlan.mockResolvedValue({
      ...plan,
      durationMinutes: 30,
      price: 35,
      badge: "Most Popular",
      enabled: false,
      version: 4,
    });
    renderAdmin(<LivePlans />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit Quick session" }),
    );
    for (const [label, value] of [
      ["Duration (minutes)", "30"],
      ["Price", "35"],
    ]) {
      await userEvent.clear(screen.getByLabelText(label));
      await userEvent.type(screen.getByLabelText(label), value);
    }
    await userEvent.type(screen.getByLabelText(/Badge/), "Most Popular");
    await userEvent.click(screen.getByLabelText("Available to ad creators"));
    await userEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() =>
      expect(api.updateLivePlan).toHaveBeenCalledWith("plan-1", {
        name: "Quick session",
        durationMinutes: 30,
        price: 35,
        currency: "CAD",
        badge: "Most Popular",
        enabled: false,
        sortOrder: 0,
        version: 3,
      }),
    );
    expect(await screen.findByText("Disabled")).toBeTruthy();
  });
  test("creates a live plan with selected currency and no client-generated id", async () => {
    api.createLivePlan.mockResolvedValue({
      ...plan,
      id: "new",
      name: "New session",
      currency: "USD",
    });
    renderAdmin(<LivePlans />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Add plan" }),
    );
    await userEvent.type(screen.getByLabelText("Plan name"), "New session");
    await userEvent.selectOptions(screen.getByLabelText("Currency"), "USD");
    await userEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() =>
      expect(api.createLivePlan).toHaveBeenCalledWith({
        name: "New session",
        durationMinutes: 10,
        price: 15,
        currency: "USD",
        badge: null,
        enabled: true,
        sortOrder: 0,
      }),
    );
  });
  test("rejects durations outside the backend range", async () => {
    renderAdmin(<LivePlans />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit Quick session" }),
    );
    await userEvent.clear(screen.getByLabelText("Duration (minutes)"));
    await userEvent.type(screen.getByLabelText("Duration (minutes)"), "181");
    await userEvent.click(screen.getByRole("button", { name: "Save plan" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Enter a duration between 1 and 180 minutes.",
    );
    expect(api.updateLivePlan).not.toHaveBeenCalled();
  });
  test("requires current values after a concurrent plan edit", async () => {
    api.updateLivePlan.mockRejectedValueOnce(
      Object.assign(new Error("changed"), { status: 409 }),
    );
    renderAdmin(<LivePlans />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit Quick session" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await screen.findByRole("button", { name: "Load latest values" });
    expect(screen.getByRole("button", { name: "Save plan" }).disabled).toBe(
      true,
    );
    api.listLivePlans.mockResolvedValueOnce({
      items: [{ ...plan, price: 25, version: 4 }],
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Load latest values" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Price").value).toBe("25"),
    );
  });
  test("moderators cannot load or edit prices", async () => {
    auth.me.mockResolvedValue({
      id: "moderator",
      name: "Moderator",
      roles: ["MODERATOR"],
    });
    renderAdmin(<LivePlans />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Only administrators can manage live plans and prices.",
    );
    expect(api.listLivePlans).not.toHaveBeenCalled();
  });
  test("failed catalog loads offer retry", async () => {
    api.listLivePlans.mockRejectedValueOnce(new Error("Could not load plans"));
    renderAdmin(<LivePlans />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );
    expect(
      await screen.findByRole("button", { name: "Edit Quick session" }),
    ).toBeTruthy();
  });
});
