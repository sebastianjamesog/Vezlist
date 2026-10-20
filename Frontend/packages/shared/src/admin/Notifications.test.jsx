import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Notifications from "./Notifications";
import * as api from "../lib/api/notifications";
vi.mock("../lib/adminScope", () => ({ useSiteScope: () => ["all"] }));
vi.mock("../lib/api/notifications", () => ({
  listNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));
const item = (id) => ({
  id,
  type: "SECURITY_EVENT",
  title: id,
  message: "Test alert",
  createdAt: "2026-10-20T00:00:00Z",
  readAt: null,
});
beforeEach(() => {
  vi.resetAllMocks();
  api.getUnreadCount.mockResolvedValue({ count: 1 });
  api.listNotifications.mockImplementation(async ({ site, cursor }) => ({
    items: [item(cursor ? "Older alert" : site)],
    nextCursor: site === "PERSONALS" && !cursor ? "2" : null,
  }));
});
test("loads both sites and reaches older notifications", async () => {
  render(<Notifications />);
  expect(await screen.findByText("PERSONALS")).toBeTruthy();
  expect(screen.getByText("MARKETPLACE")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Older alert")).toBeTruthy();
  expect(api.listNotifications).toHaveBeenCalledWith({
    site: "PERSONALS",
    cursor: "2",
  });
});
test("failed receipt stays unread and displays a retryable error", async () => {
  api.markNotificationRead.mockRejectedValue(new Error("Offline"));
  render(<Notifications />);
  fireEvent.click(await screen.findByRole("button", { name: /PERSONALS/ }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Something went wrong",
  );
  expect(screen.getAllByLabelText("Unread")).toHaveLength(2);
  expect(api.markNotificationRead).toHaveBeenCalledWith("PERSONALS", {
    site: "PERSONALS",
  });
});
test("mark all updates both scopes and displays true unread total", async () => {
  api.markAllNotificationsRead.mockResolvedValue({ count: 0 });
  render(<Notifications />);
  await screen.findByText("PERSONALS");
  api.getUnreadCount.mockResolvedValue({ count: 0 });
  fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
  await waitFor(() => expect(screen.getByText("All caught up")).toBeTruthy());
  expect(api.markAllNotificationsRead).toHaveBeenCalledWith({
    site: "PERSONALS",
  });
  expect(api.markAllNotificationsRead).toHaveBeenCalledWith({
    site: "MARKETPLACE",
  });
});
