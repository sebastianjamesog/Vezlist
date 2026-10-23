import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useTicketEvents } from "./useTicketEvents.js";

let sources;
let visibility;
class FakeSource {
  constructor(url, options) { this.url = url; this.options = options; this.handlers = {}; this.close = vi.fn(); sources.push(this); }
  addEventListener(name, callback) { this.handlers[name] = callback; }
  change(data) { this.handlers["tickets-changed"]({ data: JSON.stringify(data) }); }
}
beforeEach(() => {
  sources = [];
  vi.useFakeTimers();
  vi.stubGlobal("EventSource", FakeSource);
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test("shares a credentialed stream within an account and separates staff and sites", () => {
  const one = vi.fn(), two = vi.fn();
  const a = renderHook(() => useTicketEvents({ accountId: "u1", site: "PERSONALS", onChange: one }));
  const b = renderHook(() => useTicketEvents({ accountId: "u1", site: "PERSONALS", onChange: two }));
  const staff = renderHook(() => useTicketEvents({ accountId: "u1", staff: true, site: "PERSONALS", onChange: vi.fn() }));
  const market = renderHook(() => useTicketEvents({ accountId: "u1", site: "MARKETPLACE", onChange: vi.fn() }));
  expect(sources).toHaveLength(3);
  expect(sources[0].url).toContain("/api/v1/me/tickets/events?site=PERSONALS");
  expect(sources[0].options).toEqual({ withCredentials: true });
  expect(sources[1].url).toContain("/api/v1/admin/tickets/events");
  act(() => sources[0].change({ ticketId: "t1" }));
  expect(one).toHaveBeenCalledWith({ ticketId: "t1" });
  expect(two).toHaveBeenCalledTimes(1);
  a.unmount(); expect(sources[0].close).not.toHaveBeenCalled();
  b.unmount(); expect(sources[0].close).toHaveBeenCalledTimes(1);
  staff.unmount(); market.unmount();
});

test("closes old-account streams and ignores their late events", () => {
  const changed = vi.fn();
  const { rerender, unmount } = renderHook(({ accountId }) => useTicketEvents({ accountId, onChange: changed }), { initialProps: { accountId: "old" } });
  const old = sources[0];
  rerender({ accountId: "new" });
  expect(old.close).toHaveBeenCalled();
  act(() => old.change({ ticketId: "private-old" }));
  expect(changed).not.toHaveBeenCalled();
  rerender({ accountId: null });
  expect(sources[1].close).toHaveBeenCalled();
  unmount();
});

test("reconnects with backoff, reconciles on wake, and stops hidden/unmounted streams", async () => {
  const changed = vi.fn();
  const { unmount } = renderHook(() => useTicketEvents({ accountId: "u1", onChange: changed }));
  act(() => sources[0].onerror());
  expect(sources[0].close).toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(sources).toHaveLength(2);
  visibility = "hidden";
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(sources[1].close).toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(changed).not.toHaveBeenCalled();
  visibility = "visible";
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(sources).toHaveLength(3);
  expect(changed).toHaveBeenCalledWith({ ticketId: null });
  unmount();
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(sources).toHaveLength(3);
});
