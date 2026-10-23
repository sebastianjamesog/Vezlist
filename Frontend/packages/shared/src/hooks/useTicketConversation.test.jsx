import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useTicketConversation } from "./useTicketConversation.js";
import * as api from "../lib/api/tickets.js";

const events = vi.hoisted(() => ({ notify: null }));
vi.mock("./useTicketEvents.js", () => ({ useTicketEvents: ({ onChange }) => { events.notify = onChange; } }));
vi.mock("../lib/api/tickets.js", () => ({
  getTicket: vi.fn(), getAdminTicket: vi.fn(), replyToTicket: vi.fn(), replyAsStaff: vi.fn(),
  setAdminTicketStatus: vi.fn(), markTicketRead: vi.fn(),
}));
const message = (id, staff = false) => ({ id, staff, body: id, createdAt: "2026-10-24T00:00:00Z" });
const thread = (extra = {}) => ({ id: "t1", site: "PERSONALS", status: "OPEN", messages: [message("first")], unreadCount: 0, ...extra });
const deferred = () => { let resolve, reject; const promise = new Promise((r, fail) => { resolve = r; reject = fail; }); return { promise, resolve, reject }; };
beforeEach(() => {
  vi.resetAllMocks();
  api.getTicket.mockResolvedValue(thread());
  api.getAdminTicket.mockResolvedValue(thread());
  api.markTicketRead.mockResolvedValue(thread());
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});

test.each([false, true])("incoming events refresh the %s staff conversation without clearing its draft", async (staff) => {
  const get = staff ? api.getAdminTicket : api.getTicket;
  const { result } = renderHook(() => useTicketConversation({ id: "t1", accountId: "a1", staff }));
  await waitFor(() => expect(result.current.ticket?.messages).toHaveLength(1));
  act(() => result.current.setDraft("An unfinished reply"));
  get.mockResolvedValue(thread({ messages: [message("first"), message("answer", !staff)] }));
  act(() => events.notify({ ticketId: "other" }));
  expect(get).toHaveBeenCalledTimes(1);
  act(() => events.notify({ ticketId: "t1" }));
  await waitFor(() => expect(result.current.ticket.messages).toHaveLength(2));
  expect(result.current.draft).toBe("An unfinished reply");
  expect(result.current.loading).toBe(false);
});

test("late results from the old account or route cannot populate the new thread", async () => {
  const old = deferred();
  api.getTicket.mockReturnValueOnce(old.promise);
  const { result, rerender } = renderHook((props) => useTicketConversation(props), { initialProps: { id: "old", accountId: "old-user" } });
  rerender({ id: "t1", accountId: "new-user" });
  await waitFor(() => expect(result.current.ticket?.id).toBe("t1"));
  await act(async () => old.resolve(thread({ id: "old" })));
  expect(result.current.ticket.id).toBe("t1");
});

test("a refresh started before sending cannot overwrite the sent message", async () => {
  const { result } = renderHook(() => useTicketConversation({ id: "t1", accountId: "a1" }));
  await waitFor(() => expect(result.current.ticket).toBeTruthy());
  const stale = deferred();
  api.getTicket.mockReturnValueOnce(stale.promise);
  act(() => { result.current.setDraft("Sent reply"); events.notify({ ticketId: "t1" }); });
  const updated = thread({ messages: [message("first"), message("Sent reply")] });
  api.replyToTicket.mockResolvedValue(updated);
  api.getTicket.mockResolvedValue(updated);
  await act(async () => result.current.send());
  expect(result.current.ticket.messages).toHaveLength(2);
  await act(async () => stale.resolve(thread()));
  await waitFor(() => expect(result.current.ticket.messages).toHaveLength(2));
  expect(result.current.draft).toBe("");
  expect(api.replyToTicket).toHaveBeenCalledTimes(1);
});

test("hidden threads stay unread and read acknowledgments never replace newer messages", async () => {
  let visibility = "hidden";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  const receipt = deferred();
  api.markTicketRead.mockReturnValue(receipt.promise);
  api.getTicket.mockResolvedValue(thread({ unreadCount: 1, messages: [message("first"), message("answer", true)] }));
  const { result } = renderHook(() => useTicketConversation({ id: "t1", accountId: "a1" }));
  await waitFor(() => expect(result.current.ticket?.unreadCount).toBe(1));
  expect(api.markTicketRead).not.toHaveBeenCalled();
  visibility = "visible";
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(api.markTicketRead).toHaveBeenCalledWith("t1", "answer", { staff: false });
  api.getTicket.mockResolvedValue(thread({ messages: [message("first"), message("answer", true), message("newer", true)] }));
  act(() => events.notify({ ticketId: "t1" }));
  await waitFor(() => expect(result.current.ticket.messages).toHaveLength(3));
  await act(async () => receipt.resolve(thread()));
  expect(result.current.ticket.messages).toHaveLength(3);
});

test("a failed send preserves the draft and a retry does not resend automatically", async () => {
  const { result } = renderHook(() => useTicketConversation({ id: "t1", accountId: "a1" }));
  await waitFor(() => expect(result.current.ticket).toBeTruthy());
  api.replyToTicket.mockRejectedValue(new Error("Offline"));
  act(() => result.current.setDraft("Keep this reply"));
  await act(async () => result.current.send());
  expect(result.current.draft).toBe("Keep this reply");
  expect(result.current.error?.message).toBe("Offline");
  expect(api.replyToTicket).toHaveBeenCalledTimes(1);
});

test("a new draft typed during sending survives and a stale GET error cannot erase the sent thread", async () => {
  const { result } = renderHook(() => useTicketConversation({ id: "t1", accountId: "a1" }));
  await waitFor(() => expect(result.current.ticket).toBeTruthy());
  const stale = deferred(), reply = deferred();
  api.getTicket.mockReturnValueOnce(stale.promise);
  api.replyToTicket.mockReturnValueOnce(reply.promise);
  act(() => { result.current.setDraft("First reply"); events.notify({ ticketId: "t1" }); });
  let sending;
  act(() => { sending = result.current.send(); });
  act(() => result.current.setDraft("Second reply still being typed"));
  const updated = thread({ messages: [message("first"), message("First reply")] });
  api.getTicket.mockResolvedValue(updated);
  await act(async () => { reply.resolve(updated); await sending; });
  await act(async () => stale.reject({ status: 404, message: "stale missing thread" }));
  expect(result.current.ticket.messages).toHaveLength(2);
  expect(result.current.error).toBeNull();
  expect(result.current.draft).toBe("Second reply still being typed");
});
