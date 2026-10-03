import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  renderAdmin,
  screen,
  userEvent,
  waitFor,
  within,
} from "../../../../testing/render.jsx";
import Live from "./Live";
import * as api from "../lib/api/livePlans.js";
import * as auth from "../lib/api/auth.js";

vi.mock("../lib/api/livePlans.js", () => ({
  listLiveSessions: vi.fn(),
  endLiveSession: vi.fn(),
}));
vi.mock("../lib/api/auth.js", () => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));
const session = {
  id: "live-1",
  creatorName: "Jamie",
  title: "Evening chat",
  location: "Montreal",
  status: "LIVE",
  durationMinutes: 10,
  demoPurchase: true,
  startedAt: "2026-10-04T12:00:00Z",
  endsAt: "2026-10-04T12:10:00Z",
  paymentDetails: [{ value: "private@example.com" }],
};

describe("Live session moderation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.me.mockResolvedValue({
      id: "moderator",
      name: "Moderator",
      roles: ["MODERATOR"],
    });
    api.listLiveSessions.mockResolvedValue({ items: [session], total: 1 });
  });
  test("shows backend status and demo label without inventing viewers or exposing payment details", async () => {
    renderAdmin(<Live />);
    expect(await screen.findByText("Jamie")).toBeTruthy();
    expect(screen.getByText("Demo purchase")).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.queryByText("private@example.com")).toBeNull();
    expect(screen.queryByText(/viewers/i)).toBeNull();
    expect(api.listLiveSessions).toHaveBeenCalledWith(50);
  });
  test("moderators can end sessions only after confirming", async () => {
    api.endLiveSession.mockResolvedValue({ ...session, status: "ENDED" });
    renderAdmin(<Live />);
    await userEvent.click(
      await screen.findByRole("button", { name: "End session for Jamie" }),
    );
    const dialog = screen.getByRole("dialog", { name: "End live session?" });
    expect(api.endLiveSession).not.toHaveBeenCalled();
    api.listLiveSessions.mockResolvedValue({
      items: [{ ...session, status: "ENDED" }],
      total: 1,
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "End session" }),
    );
    await waitFor(() =>
      expect(api.endLiveSession).toHaveBeenCalledWith("live-1"),
    );
    expect(await screen.findByText("Ended")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "End session for Jamie" }),
    ).toBeNull();
  });
  test("cancelling confirmation does not end a session", async () => {
    renderAdmin(<Live />);
    await userEvent.click(
      await screen.findByRole("button", { name: "End session for Jamie" }),
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.endLiveSession).not.toHaveBeenCalled();
  });
  test("failed end requests keep confirmation available for retry", async () => {
    api.endLiveSession.mockRejectedValue(
      new Error("Streaming service unavailable"),
    );
    renderAdmin(<Live />);
    await userEvent.click(
      await screen.findByRole("button", { name: "End session for Jamie" }),
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "End session",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Streaming service unavailable",
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  test("empty and failed list states are distinct", async () => {
    api.listLiveSessions.mockRejectedValueOnce(
      new Error("Cannot load sessions"),
    );
    renderAdmin(<Live />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Cannot load sessions Try again",
    );
    expect(screen.queryByText("No live sessions")).toBeNull();
    api.listLiveSessions.mockResolvedValue({ items: [], total: 0 });
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No live sessions")).toBeTruthy();
  });
});
