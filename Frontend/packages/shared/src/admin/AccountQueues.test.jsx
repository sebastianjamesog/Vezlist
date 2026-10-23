import { beforeEach, expect, test, vi } from "vitest";
import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import Users from "./Users";
import Tickets from "./Tickets";
import * as users from "../lib/api/adminUsers";
import * as tickets from "../lib/api/tickets.js";
const state = vi.hoisted(() => ({ query: "", set: vi.fn() }));
vi.mock("../context/AdminAuthContext", () => ({
  useAdminAuth: () => ({ admin: { id: "staff" }, can: () => false }),
}));
vi.mock("../hooks/useTicketEvents.js", () => ({ useTicketEvents: vi.fn() }));
vi.mock("../context/ToastContext", () => ({ useToast: () => vi.fn() }));
vi.mock("../lib/adminScope", () => ({
  useQueryParam: (key, fallback) => [
    key === "q" ? state.query : fallback,
    state.set,
  ],
  useSiteScope: () => ["all"],
}));
vi.mock("../hooks/useAdminSettings.js", () => ({
  useAdminSettings: () => ({ ticketSlaHours: 1 }),
}));
vi.mock("../lib/api/adminUsers", () => ({ listAdminUsers: vi.fn() }));
vi.mock("../lib/api/tickets.js", () => ({ listAdminTickets: vi.fn() }));
const row = (name) => ({
  id: name,
  displayName: name,
  email: name + "@test.invalid",
  roles: ["USER"],
  enabled: true,
  createdAt: "2026-01-01",
  listingCount: 0,
});
const page = (name) => ({ items: [row(name)], totalCount: 1, hasMore: false });
beforeEach(() => {
  vi.resetAllMocks();
  state.query = "";
});
test("a slow previous search cannot overwrite the current user results", async () => {
  let old;
  users.listAdminUsers.mockImplementation(({ query }) =>
    query
      ? Promise.resolve(page("Current result"))
      : new Promise((r) => (old = r)),
  );
  const view = render(<Users />);
  state.query = "current";
  view.rerender(<Users />);
  await screen.findByText("Current result");
  await act(async () => old(page("Stale result")));
  expect(screen.queryByText("Stale result")).toBeNull();
  expect(screen.getByText("Current result")).toBeTruthy();
});
test("failed support list stops the loading indicator and can be refreshed", async () => {
  tickets.listAdminTickets.mockRejectedValue(new Error("Disconnected"));
  render(<Tickets />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Disconnected",
  );
  expect(screen.queryByText(/Loading tickets/)).toBeNull();
  tickets.listAdminTickets.mockResolvedValue({ items: [], nextOffset: null });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Nothing here");
  expect(screen.queryByRole("alert")).toBeNull();
});
test("support SLA uses configured target and never flags resolved tickets", async () => {
  tickets.listAdminTickets.mockImplementation(async ({ site }) => ({
    items:
      site === "PERSONALS"
        ? [
            {
              id: "a",
              subject: "Open ticket",
              ownerName: "Test",
              site,
              status: "OPEN",
              updatedAt: "2020-01-01",
            },
            {
              id: "b",
              subject: "Closed ticket",
              ownerName: "Test",
              site,
              status: "RESOLVED",
              updatedAt: "2020-01-01",
            },
          ]
        : [],
    nextOffset: null,
  }));
  render(<Tickets />);
  await screen.findByText("Open ticket");
  expect(screen.getAllByText("Overdue")).toHaveLength(1);
});
