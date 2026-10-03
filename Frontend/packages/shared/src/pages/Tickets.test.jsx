import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor, within } from "../../../../testing/render.jsx";
import { router, setRoute } from "../../../../testing/stubs/next-navigation.js";
import * as authApi from "../lib/api/auth.js";
import * as ticketsApi from "../lib/api/tickets.js";
import Tickets from "./Tickets";
import TicketDetail from "./TicketDetail";

vi.mock("../lib/api/auth.js", () => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() }));
vi.mock("../lib/api/tickets.js", () => ({
  listTickets: vi.fn(), createTicket: vi.fn(), getTicket: vi.fn(), replyToTicket: vi.fn(),
}));

const now = "2026-09-28T12:00:00Z";
const ticket = (id, status, subject) => ({
  id, ownerId: "user-1", ownerName: "Test User", site: "MARKETPLACE",
  subject, status, createdAt: now, updatedAt: now,
  messages: [{ id: `${id}-message`, senderName: "Test User", staff: false, body: "A real question", createdAt: now }],
});

describe("API-backed support tickets", () => {
  beforeEach(() => {
    setRoute({ path: "/support/tickets" });
    authApi.me.mockReset().mockResolvedValue({ id: "user-1", name: "Test User", email: "user@example.test", roles: ["USER"] });
    ticketsApi.listTickets.mockReset().mockResolvedValue({
      items: [ticket("open-1", "OPEN", "Open issue"), ticket("done-1", "RESOLVED", "Resolved issue")],
      nextOffset: null,
    });
    ticketsApi.createTicket.mockReset();
    ticketsApi.getTicket.mockReset();
    ticketsApi.replyToTicket.mockReset();
  });

  test("loads account tickets and filters the server results by status", async () => {
    const user = userEvent.setup();
    renderApp(<Tickets />);
    expect(await screen.findByText("Open issue")).toBeTruthy();
    expect(screen.getByText("Resolved issue")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Resolved" }));
    expect(screen.queryByText("Open issue")).toBeNull();
    expect(screen.getByText("Resolved issue")).toBeTruthy();
    expect(ticketsApi.listTickets).toHaveBeenCalled();
  });

  test("requires a subject and message before calling the API", async () => {
    const user = userEvent.setup();
    renderApp(<Tickets />);
    await user.click(screen.getByRole("button", { name: "New ticket" }));
    const dialog = screen.getByRole("dialog", { name: "New ticket" });
    await user.click(within(dialog).getByRole("button", { name: "Open ticket" }));
    expect(within(dialog).getByText("Give it a subject.")).toBeTruthy();
    expect(within(dialog).getByText("Say what's going on.")).toBeTruthy();
    expect(ticketsApi.createTicket).not.toHaveBeenCalled();
  });

  test("creates a ticket and reads its persisted thread through the API", async () => {
    ticketsApi.createTicket.mockResolvedValue(ticket("created-1", "OPEN", "Promotion issue"));
    ticketsApi.getTicket.mockResolvedValue(ticket("created-1", "OPEN", "Promotion issue"));
    const user = userEvent.setup();
    const first = renderApp(<Tickets />);
    await screen.findByText("Open issue");
    await user.click(screen.getByRole("button", { name: "New ticket" }));
    const dialog = screen.getByRole("dialog", { name: "New ticket" });
    await user.type(within(dialog).getByRole("textbox", { name: "Subject" }), "Promotion issue");
    await user.type(within(dialog).getByRole("textbox", { name: "Message" }), "A real question");
    await user.click(within(dialog).getByRole("button", { name: "Open ticket" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/support/tickets/created-1"));
    expect(ticketsApi.createTicket).toHaveBeenCalledWith({ subject: "Promotion issue", body: "A real question" });

    first.unmount();
    setRoute({ path: "/support/tickets/created-1", params: { id: "created-1" } });
    renderApp(<TicketDetail />);
    expect(await screen.findByText("A real question")).toBeTruthy();
    expect(ticketsApi.getTicket).toHaveBeenCalledWith("created-1");
  });
});
