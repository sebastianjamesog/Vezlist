import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  renderAdmin,
  screen,
  userEvent,
  waitFor,
} from "../../../../testing/render.jsx";
import StoryPlans from "./StoryPlans";
import * as storyPlansApi from "../lib/api/storyPlans.js";
import * as authApi from "../lib/api/auth.js";

vi.mock("../lib/api/storyPlans.js", () => ({
  listStoryPlans: vi.fn(),
  createStoryPlan: vi.fn(),
  updateStoryPlan: vi.fn(),
}));
vi.mock("../lib/api/auth.js", () => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

const pack = {
  id: "pack-1",
  name: "Single Story",
  price: 5,
  currency: "CAD",
  storyCount: 1,
  sortOrder: 0,
  enabled: true,
  version: 2,
};

describe("admin story packs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authApi.me.mockResolvedValue({
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });
    storyPlansApi.listStoryPlans.mockResolvedValue({ items: [pack] });
  });

  test("saves edited prices, pack sizes, availability, and version to the backend", async () => {
    storyPlansApi.updateStoryPlan.mockResolvedValue({
      ...pack,
      price: 12,
      storyCount: 3,
      enabled: false,
      version: 3,
    });
    renderAdmin(<StoryPlans />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit Single Story" }),
    );
    await userEvent.clear(screen.getByLabelText("Price"));
    await userEvent.type(screen.getByLabelText("Price"), "12");
    await userEvent.clear(screen.getByLabelText("Stories in pack"));
    await userEvent.type(screen.getByLabelText("Stories in pack"), "3");
    await userEvent.click(screen.getByLabelText("Available to ad creators"));
    await userEvent.click(screen.getByRole("button", { name: "Save pack" }));
    await waitFor(() =>
      expect(storyPlansApi.updateStoryPlan).toHaveBeenCalledWith("pack-1", {
        name: "Single Story",
        price: 12,
        currency: "CAD",
        storyCount: 3,
        sortOrder: 0,
        enabled: false,
        version: 2,
      }),
    );
    expect(await screen.findByText("Disabled")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save pack" })).toBeNull();
  });

  test("creates a free pack without granting a fake payment or credit", async () => {
    storyPlansApi.createStoryPlan.mockResolvedValue({
      ...pack,
      id: "pack-2",
      name: "Free Story",
      price: 0,
      version: 0,
    });
    renderAdmin(<StoryPlans />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Add pack" }),
    );
    await userEvent.type(screen.getByLabelText("Pack name"), "Free Story");
    await userEvent.clear(screen.getByLabelText("Price"));
    await userEvent.type(screen.getByLabelText("Price"), "0");
    await userEvent.click(screen.getByRole("button", { name: "Save pack" }));
    await waitFor(() =>
      expect(storyPlansApi.createStoryPlan).toHaveBeenCalledWith({
        name: "Free Story",
        price: 0,
        currency: "CAD",
        storyCount: 1,
        sortOrder: 0,
        enabled: true,
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Free Story" }),
    ).toBeTruthy();
  });

  test("a conflicting edit requires loading current values before another save", async () => {
    storyPlansApi.updateStoryPlan.mockRejectedValueOnce(
      Object.assign(new Error("conflict"), { status: 409 }),
    );
    renderAdmin(<StoryPlans />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit Single Story" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save pack" }));
    expect(
      await screen.findByRole("button", { name: "Load latest values" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save pack" }).disabled).toBe(
      true,
    );
    storyPlansApi.listStoryPlans.mockResolvedValueOnce({
      items: [{ ...pack, price: 7, version: 3 }],
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Load latest values" }),
    );
    await waitFor(() => expect(screen.getByLabelText("Price").value).toBe("7"));
    expect(screen.getByRole("button", { name: "Save pack" }).disabled).toBe(
      false,
    );
  });

  test("moderators cannot fetch or edit story pricing", async () => {
    authApi.me.mockResolvedValue({
      id: "moderator-1",
      name: "Moderator",
      roles: ["MODERATOR"],
    });
    renderAdmin(<StoryPlans />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Only administrators can manage story packs and prices.",
    );
    expect(storyPlansApi.listStoryPlans).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Add pack" })).toBeNull();
  });

  test("failed loads can be retried without creating local fallback packs", async () => {
    storyPlansApi.listStoryPlans.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    renderAdmin(<StoryPlans />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Network unavailable Try again",
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("button", { name: "Edit Single Story" }),
    ).toBeTruthy();
  });
});
