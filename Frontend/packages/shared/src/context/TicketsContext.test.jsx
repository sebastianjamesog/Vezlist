import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { TicketsProvider, useTickets } from "./TicketsContext.jsx";
import * as api from "../lib/api/tickets.js";
const state = vi.hoisted(() => ({
  user: { id: "one" },
  ready: true,
  events: null,
}));
vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: state.user, ready: state.ready }),
}));
vi.mock("../hooks/useTicketEvents.js", () => ({
  useTicketEvents: (options) => {
    state.events = options;
  },
}));
vi.mock("../lib/api/tickets.js", () => ({
  listTickets: vi.fn(),
  createTicket: vi.fn(),
  getTicket: vi.fn(),
  replyToTicket: vi.fn(),
}));
const row = (id, unreadCount = 0, ownerId = "one") => ({
  id,
  ownerId,
  subject: id,
  status: "OPEN",
  updatedAt: "2026-10-24",
  unreadCount,
});
const page = (items, nextOffset = null) => ({ items, nextOffset });
beforeEach(() => {
  vi.resetAllMocks();
  state.user = { id: "one" };
  state.ready = true;
  state.events = null;
});

test("live invalidation refreshes all loaded pages and deduplicates shifted rows", async () => {
  api.listTickets.mockImplementation(async ({ offset }) =>
    offset === 0 ? page([row("first")], 50) : page([row("second")], 100),
  );
  const { result } = renderHook(useTickets, { wrapper: TicketsProvider });
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => result.current.loadMore());
  expect(result.current.tickets.map((x) => x.id)).toEqual(["first", "second"]);
  api.listTickets.mockClear();
  api.listTickets.mockImplementation(async ({ offset }) =>
    offset === 0
      ? page([row("second", 2)], 50)
      : page([row("second", 2), row("first")], 100),
  );
  await act(async () => state.events.onChange({ ticketId: "second" }));
  expect(api.listTickets.mock.calls.map(([args]) => args.offset)).toEqual([
    0, 50,
  ]);
  expect(result.current.tickets.map((x) => x.id)).toEqual(["second", "first"]);
  expect(result.current.tickets[0].unreadCount).toBe(2);
  expect(result.current.nextOffset).toBe(100);
});

test("rows remain visible while realtime refresh is pending or fails", async () => {
  api.listTickets.mockResolvedValue(page([row("visible", 3)]));
  const { result } = renderHook(useTickets, { wrapper: TicketsProvider });
  await waitFor(() => expect(result.current.ready).toBe(true));
  let fail;
  api.listTickets.mockImplementation(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  let refresh;
  act(() => {
    refresh = state.events.onChange();
  });
  expect(result.current.ready).toBe(true);
  expect(result.current.tickets[0].id).toBe("visible");
  await act(async () => {
    fail(new Error("Offline"));
    await refresh;
  });
  expect(result.current.tickets[0].unreadCount).toBe(3);
  expect(result.current.error.message).toBe("Offline");
});

test("late prior-account lists and creation responses cannot leak into a new account", async () => {
  let oldList, oldCreate;
  api.listTickets.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        oldList = resolve;
      }),
  );
  api.createTicket.mockImplementation(
    () =>
      new Promise((resolve) => {
        oldCreate = resolve;
      }),
  );
  const { result, rerender } = renderHook(useTickets, {
    wrapper: TicketsProvider,
  });
  let pending;
  act(() => {
    pending = result.current
      .open({ subject: "draft", body: "message" })
      .catch((error) => error);
  });
  state.user = { id: "two" };
  api.listTickets.mockResolvedValue(page([row("new account", 0, "two")]));
  rerender();
  await waitFor(() =>
    expect(result.current.tickets[0]?.id).toBe("new account"),
  );
  await act(async () => {
    oldList(page([row("old account")]));
    oldCreate(row("old creation"));
    await pending;
  });
  expect(result.current.tickets.map((x) => x.id)).toEqual(["new account"]);
  expect((await pending).message).toMatch(/account changed/);
  expect(state.events.accountId).toBe("two");
});

test("anonymous and restoring sessions do not subscribe or fetch", async () => {
  state.user = null;
  state.ready = false;
  const { result, rerender } = renderHook(useTickets, {
    wrapper: TicketsProvider,
  });
  expect(state.events.accountId).toBeNull();
  expect(api.listTickets).not.toHaveBeenCalled();
  state.ready = true;
  rerender();
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(api.listTickets).not.toHaveBeenCalled();
});
