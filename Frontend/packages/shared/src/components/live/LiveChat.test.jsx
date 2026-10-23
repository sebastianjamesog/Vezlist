import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LiveChat from "./LiveChat";
import { getLiveViewerTicket, muteLiveChatUser } from "../../lib/api/live";
const auth = { signedIn: false, user: null };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../lib/api/live", () => ({
  getLiveViewerTicket: vi.fn(),
  deleteLiveChatMessage: vi.fn(),
  muteLiveChatUser: vi.fn(),
}));
let sockets;
class Socket {
  static OPEN = 1;
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.send = vi.fn();
    this.close = vi.fn(() => {
      this.readyState = 3;
      this.onclose?.();
    });
    sockets.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen();
  }
  message(payload) {
    this.onmessage({ data: JSON.stringify(payload) });
  }
}
const message = {
  id: "message-1",
  sequence: 1,
  userId: "other",
  name: "Viewer",
  text: "Hello creator",
  sentAt: "2026-10-04T00:00:00Z",
};
beforeEach(() => {
  sockets = [];
  auth.signedIn = false;
  auth.user = null;
  vi.stubGlobal("WebSocket", Socket);
  getLiveViewerTicket.mockReset().mockResolvedValue({
    ticket: "chat-ticket",
    webSocketUrl: "ws://localhost/chat",
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function ready(canChat = false) {
  await waitFor(() => expect(sockets).toHaveLength(1));
  act(() => {
    sockets[0].open();
    sockets[0].message({
      type: "ready",
      canChat,
      viewerCount: 7,
      messages: [],
    });
  });
}
describe.each([false, true])(
  "live chat permissions and delivery (overlay=%s)",
  (overlay) => {
    test("guests can read live chat and real count but must sign in to send", async () => {
      const onViewerCount = vi.fn();
      render(
        <LiveChat
          overlay={overlay}
          sessionId="session-1"
          onViewerCount={onViewerCount}
        />,
      );
      await ready();
      expect(JSON.parse(sockets[0].send.mock.calls[0][0])).toEqual({
        type: "authenticate",
        ticket: "chat-ticket",
      });
      expect(sockets[0].url).not.toContain("chat-ticket");
      expect(onViewerCount).toHaveBeenCalledWith(7);
      act(() => {
        sockets[0].message({ type: "message", message });
        sockets[0].message({ type: "message", message });
      });
      expect(screen.getAllByText("Hello creator")).toHaveLength(1);
      expect(
        screen.getByRole("link", { name: "Sign in to chat" }),
      ).toBeTruthy();
      expect(screen.queryByRole("textbox")).toBeNull();
    });
    test("signed-in sending waits for server acknowledgement and honors a mute", async () => {
      auth.signedIn = true;
      auth.user = { id: "me" };
      const user = userEvent.setup();
      render(<LiveChat overlay={overlay} sessionId="session-1" />);
      await ready(true);
      await user.type(
        screen.getByRole("textbox", { name: "Chat message" }),
        "My message",
      );
      await user.click(screen.getByRole("button", { name: "Send message" }));
      const payload = JSON.parse(sockets[0].send.mock.calls.at(-1)[0]);
      expect(payload).toMatchObject({
        type: "message",
        text: "My message",
        clientId: expect.any(String),
      });
      expect(screen.getByRole("textbox").value).toBe("My message");
      act(() =>
        sockets[0].message({
          type: "ack",
          clientId: payload.clientId,
          messageId: "new-id",
        }),
      );
      expect(screen.getByRole("textbox").value).toBe("");
      act(() =>
        sockets[0].message({ type: "muted", userId: "me", muted: true }),
      );
      expect(screen.getByRole("textbox").disabled).toBe(true);
      expect(screen.getByRole("alert").textContent).toContain("muted");
    });
    test("ended sessions remove chat and stop reconnect attempts", async () => {
      render(<LiveChat overlay={overlay} sessionId="session-1" />);
      await ready();
      act(() => {
        sockets[0].message({ type: "message", message });
        sockets[0].message({ type: "ended" });
      });
      expect(screen.queryByText("Hello creator")).toBeNull();
      expect(
        screen.queryByRole("link", { name: "Sign in to chat" }),
      ).toBeNull();
      expect(sockets[0].close).toHaveBeenCalledOnce();
    });
    test("deleted messages stay removed when delayed room events arrive", async () => {
      render(<LiveChat overlay={overlay} sessionId="session-1" />);
      await ready();
      act(() => {
        sockets[0].message({ type: "message_deleted", id: message.id });
        sockets[0].message({ type: "message", message });
      });
      expect(screen.queryByText("Hello creator")).toBeNull();
    });

    test.each(["ADMIN", "MODERATOR"])("a public %s viewer has no host moderation controls", async (role) => {
      auth.signedIn = true;
      auth.user = { id: "staff-viewer", roles: [role] };
      render(<LiveChat overlay={overlay} sessionId="session-1" />);
      await ready(true);
      act(() => sockets[0].message({ type: "message", message }));
      expect(screen.getByText("Hello creator")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Remove message from Viewer" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Mute Viewer" })).toBeNull();
    });

    test("host can unmute a creator from server moderation state", async () => {
      auth.signedIn = true;
      auth.user = { id: "host" };
      const user = userEvent.setup();
      render(<LiveChat overlay={overlay} sessionId="session-1" host />);
      await ready(true);
      act(() => {
        sockets[0].message({
          type: "ready",
          canChat: true,
          viewerCount: 1,
          messages: [message],
          mutedUserIds: ["other"],
        });
      });
      await user.click(screen.getByRole("button", { name: "Unmute Viewer" }));
      expect(muteLiveChatUser).toHaveBeenCalledWith(
        "session-1",
        "other",
        false,
      );
      act(() =>
        sockets[0].message({ type: "muted", userId: "other", muted: false }),
      );
      expect(screen.getByRole("button", { name: "Mute Viewer" })).toBeTruthy();
    });

    test("server chat permission is required even for a signed-in viewer", async () => {
      auth.signedIn = true;
      auth.user = { id: "me" };
      render(<LiveChat overlay={overlay} sessionId="session-1" />);
      await ready(false);
      expect(screen.getByRole("textbox").disabled).toBe(true);
      fireEvent.submit(screen.getByRole("textbox").closest("form"));
      expect(sockets[0].send).toHaveBeenCalledTimes(1);
    });
  },
);
