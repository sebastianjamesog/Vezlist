import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import Tickets from "./Tickets.jsx";
const state = vi.hoisted(() => ({ tickets: [], error: null }));
vi.mock("../context/TicketsContext", () => ({
  useTickets: () => ({
    tickets: state.tickets,
    ready: true,
    error: state.error,
    nextOffset: null,
    refresh: vi.fn(),
    loadMore: vi.fn(),
    open: vi.fn(),
  }),
}));
vi.mock("../context/ToastContext", () => ({ useToast: () => vi.fn() }));
beforeEach(() => {
  state.tickets = [
    {
      id: "one",
      title: "Question",
      icon: "ReceiptText",
      status: "In Progress",
      meta: "Today",
      unreadCount: 2,
    },
  ];
  state.error = null;
});
test("live unread updates keep an unfinished ticket draft intact", () => {
  const view = render(<Tickets />);
  expect(screen.getByLabelText("2 unread messages")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "New ticket" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Subject" }), {
    target: { value: "My unfinished question" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: "Draft message" },
  });
  state.tickets = [{ ...state.tickets[0], unreadCount: 3 }];
  view.rerender(<Tickets />);
  expect(screen.getByLabelText("3 unread messages")).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Subject" }).value).toBe(
    "My unfinished question",
  );
  expect(screen.getByRole("textbox", { name: "Message" }).value).toBe(
    "Draft message",
  );
  state.error = new Error("Offline");
  view.rerender(<Tickets />);
  expect(screen.getByText("Question")).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Message" }).value).toBe(
    "Draft message",
  );
});
