import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import Tickets from "./Tickets.jsx";
import { listAdminTickets } from "../lib/api/tickets.js";
const state = vi.hoisted(() => ({
  accountId: "staff",
  site: "all",
  status: "open",
  events: {},
}));
vi.mock("../context/AdminAuthContext", () => ({
  useAdminAuth: () => ({
    admin: state.accountId ? { id: state.accountId } : null,
  }),
}));
vi.mock("../lib/adminScope", () => ({
  useSiteScope: () => [state.site],
  useQueryParam: () => [state.status, vi.fn()],
}));
vi.mock("../hooks/useAdminSettings.js", () => ({
  useAdminSettings: () => ({ ticketSlaHours: 24 }),
}));
vi.mock("../hooks/useTicketEvents.js", () => ({
  useTicketEvents: (options) => {
    state.events[options.site] = options;
  },
}));
vi.mock("../lib/api/tickets.js", () => ({ listAdminTickets: vi.fn() }));
const row = (id, site, unreadCount = 0) => ({
  id,
  subject: id,
  site,
  ownerName: "Requester",
  unreadCount,
  status: "OPEN",
  updatedAt: "2026-10-24",
});
const page = (items, nextOffset = null) => ({ items, nextOffset });
beforeEach(() => {
  vi.resetAllMocks();
  state.accountId = "staff";
  state.site = "all";
  state.status = "open";
  state.events = {};
});

test("both board subscriptions update unread badges without resetting loaded pages", async () => {
  listAdminTickets.mockImplementation(async ({ site, offset }) =>
    site === "PERSONALS"
      ? page([row("Personal", site)])
      : offset === 0
        ? page([row("First", site)], 50)
        : page([row("Second", site)]),
  );
  render(<Tickets />);
  await screen.findByText("First");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByText("Second");
  expect(state.events.MARKETPLACE).toMatchObject({
    staff: true,
    accountId: "staff",
  });
  expect(state.events.PERSONALS).toMatchObject({
    staff: true,
    accountId: "staff",
  });
  listAdminTickets.mockClear();
  listAdminTickets.mockImplementation(async ({ site, offset }) =>
    site === "PERSONALS"
      ? page([row("Personal", site, 1)])
      : offset === 0
        ? page([row("Second", site, 2)], 50)
        : page([row("Second", site, 2), row("First", site)]),
  );
  await act(async () =>
    state.events.PERSONALS.onChange({ ticketId: "Personal" }),
  );
  expect(screen.getAllByText("Second")).toHaveLength(1);
  expect(screen.getByText("First")).toBeTruthy();
  expect(screen.getByLabelText("2 unread messages")).toBeTruthy();
  expect(screen.getByLabelText("1 unread messages")).toBeTruthy();
  expect(
    listAdminTickets.mock.calls.some(
      ([args]) => args.site === "MARKETPLACE" && args.offset === 50,
    ),
  ).toBe(true);
});

test("site and account changes reject stale responses and disable excluded subscriptions", async () => {
  state.site = "marketplace";
  let old;
  listAdminTickets.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        old = resolve;
      }),
  );
  const view = render(<Tickets />);
  state.site = "personals";
  listAdminTickets.mockResolvedValue(page([row("Current", "PERSONALS")]));
  view.rerender(<Tickets />);
  await screen.findByText("Current");
  await act(async () => old(page([row("Stale", "MARKETPLACE")])));
  expect(screen.queryByText("Stale")).toBeNull();
  expect(state.events.MARKETPLACE.accountId).toBeNull();
  expect(state.events.PERSONALS.accountId).toBe("staff");
  let oldStaff;
  listAdminTickets.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        oldStaff = resolve;
      }),
  );
  let pending;
  act(() => {
    pending = state.events.PERSONALS.onChange();
  });
  state.accountId = "other-staff";
  listAdminTickets.mockResolvedValue(page([row("Other account", "PERSONALS")]));
  view.rerender(<Tickets />);
  await screen.findByText("Other account");
  await act(async () => {
    oldStaff(page([row("Old staff data", "PERSONALS")]));
    await pending;
  });
  expect(screen.queryByText("Old staff data")).toBeNull();
});

test("background failure leaves loaded rows visible", async () => {
  listAdminTickets.mockResolvedValue(page([row("Visible", "MARKETPLACE")]));
  render(<Tickets />);
  await screen.findByText("Visible");
  listAdminTickets.mockRejectedValue(new Error("Offline"));
  await act(async () => state.events.MARKETPLACE.onChange());
  expect(screen.getByText("Visible")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("Offline");
  expect(screen.queryByText(/Loading tickets/)).toBeNull();
});
