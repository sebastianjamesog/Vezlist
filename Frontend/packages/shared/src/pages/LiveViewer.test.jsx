import { beforeEach, expect, test, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { setRoute } from "../../../../testing/stubs/next-navigation.js";
import { getLiveSession } from "../lib/api/live";
import LiveViewer from "./LiveViewer";
vi.mock("../lib/api/live", () => ({ getLiveSession: vi.fn() }));
const auth = { signedIn: false, user: null };
const saved = { isSaved: vi.fn(() => false), toggle: vi.fn() };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../context/SavedContext", () => ({ useSaved: () => saved }));
vi.mock("../components/ReportDialog", () => ({
  default: ({ open, targetType, targetId }) =>
    open ? (
      <div
        role="dialog"
        aria-label="Report linked ad"
        data-target-type={targetType}
      >
        {targetId}
      </div>
    ) : null,
}));
vi.mock("../components/live/LivePlayer", () => ({
  default: ({ playbackUrl, immersive }) => (
    <div data-testid="live-player" data-immersive={immersive}>
      {playbackUrl}
    </div>
  ),
}));
vi.mock("../components/live/LiveChat", () => ({
  default: ({ overlay, composerAction }) => (
    <div>
      <div data-overlay={overlay}>Live chat</div>
      {composerAction}
    </div>
  ),
}));
const session = {
  id: "session-1",
  ownerId: "creator-1",
  creatorName: "Alex",
  title: "Live session",
  status: "LIVE",
  playbackUrl: "https://live.example.gvideo.io/cmaf/session/master.m3u8",
  paymentDetails: [
    { method: "INTERAC", details: "creator@example.com", enabled: true },
    { method: "PAYPAL", details: "hidden@example.com", enabled: false },
  ],
};
beforeEach(() => {
  setRoute({ path: "/live/session-1", params: { id: "session-1" } });
  getLiveSession.mockReset().mockResolvedValue(session);
  auth.signedIn = false;
  auth.user = null;
  saved.isSaved.mockReset().mockReturnValue(false);
  saved.toggle.mockReset().mockResolvedValue(undefined);
});
test("guests can view real playback and only enabled payment details", async () => {
  render(<LiveViewer />);
  expect(await screen.findByTestId("live-player")).toBeTruthy();
  const broadcastCard = screen.getByRole("region", { name: "Live broadcast" });
  expect(broadcastCard.contains(screen.getByText("Live chat"))).toBe(true);
  expect(broadcastCard.contains(screen.getByTestId("live-player"))).toBe(true);
  expect(screen.getByText("Live chat").getAttribute("data-overlay")).toBe(
    "true",
  );
  expect(screen.getByTestId("live-player").getAttribute("data-immersive")).toBe(
    "true",
  );
  expect(screen.getByText("Free to watch")).toBeTruthy();
  expect(screen.queryByText("creator@example.com")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Payment details" }));
  expect(
    screen.getByRole("dialog", { name: "Pay the creator directly" }),
  ).toBeTruthy();
  expect(screen.getByText("creator@example.com")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Alex" }).getAttribute("href")).toBe(
    "/seller/creator-1",
  );
  expect(screen.queryByText("hidden@example.com")).toBeNull();
});
test("preparing session waits for live before connecting chat and keeps chat during reconnect", async () => {
  getLiveSession.mockResolvedValue({ ...session, status: "PREPARING" });
  render(<LiveViewer />);
  expect(await screen.findByText("The creator is getting ready")).toBeTruthy();
  expect(screen.queryByTestId("live-player")).toBeNull();
  expect(screen.queryByText("Live chat")).toBeNull();
  expect(
    screen.getByText("Chat will connect when the broadcast is live."),
  ).toBeTruthy();
  getLiveSession.mockResolvedValue(session);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(screen.getByText("Live chat")).toBeTruthy();
  expect(
    screen.queryByText("Chat will connect when the broadcast is live."),
  ).toBeNull();
  getLiveSession.mockResolvedValue({ ...session, status: "RECONNECTING" });
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(screen.getByText("Live chat")).toBeTruthy();
  expect(screen.getByText("The creator is reconnecting")).toBeTruthy();
});
test("ended session removes playback and chat and offers no replay", async () => {
  getLiveSession.mockResolvedValue({ ...session, status: "ENDED" });
  render(<LiveViewer />);
  expect(await screen.findByText("This live session has ended")).toBeTruthy();
  expect(screen.queryByTestId("live-player")).toBeNull();
  expect(screen.queryByText("Live chat")).toBeNull();
  expect(screen.getByText("Live sessions have no replay.")).toBeTruthy();
});
test("expired server deadline removes live playback even with stale LIVE status", async () => {
  getLiveSession.mockResolvedValue({
    ...session,
    endsAt: "2020-01-01T00:00:00Z",
  });
  render(<LiveViewer />);
  expect(await screen.findByText("This live session has ended")).toBeTruthy();
  expect(screen.queryByTestId("live-player")).toBeNull();
});
test("failed public load keeps an error and retry instead of inventing a stream", async () => {
  getLiveSession.mockRejectedValue(new Error("Session unavailable"));
  render(<LiveViewer />);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Session unavailable"),
  );
  expect(screen.queryByTestId("live-player")).toBeNull();
});

test("immersive header shows actual location and close, without invented follow or live reactions", async () => {
  getLiveSession.mockResolvedValue({
    ...session,
    location: "Toronto, Ontario",
    startedAt: new Date(Date.now() - 120000).toISOString(),
  });
  render(<LiveViewer />);
  await screen.findByTestId("live-player");
  expect(screen.getByText("Toronto, Ontario")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Back to live directory" })
      .getAttribute("href"),
  ).toBe("/live");
  expect(screen.getByText(/Started 2 minutes ago/)).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /Follow|Like live|Report live/ }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: /Save linked ad/ })).toBeNull();
});

test("linked ad heart and report respect guest sign-in and real signed-in actions", async () => {
  getLiveSession.mockResolvedValue({ ...session, listingId: "linked-ad" });
  const view = render(<LiveViewer />);
  await screen.findByTestId("live-player");
  expect(
    screen
      .getByRole("link", { name: "Sign in to save linked ad" })
      .getAttribute("href"),
  ).toContain("/login?next=");
  expect(
    screen.getByRole("link", { name: "Sign in to report linked ad" }),
  ).toBeTruthy();
  auth.signedIn = true;
  auth.user = { id: "viewer" };
  view.rerender(<LiveViewer />);
  fireEvent.click(screen.getByRole("button", { name: "Save linked ad" }));
  await waitFor(() => expect(saved.toggle).toHaveBeenCalledWith("linked-ad"));
  fireEvent.click(screen.getByRole("button", { name: "Report linked ad" }));
  expect(
    screen
      .getByRole("dialog", { name: "Report linked ad" })
      .getAttribute("data-target-type"),
  ).toBe("listing");
  expect(screen.getByText("linked-ad")).toBeTruthy();
});

test("save failure is visible and the heart cannot issue duplicate writes while pending", async () => {
  auth.signedIn = true;
  auth.user = { id: "viewer" };
  getLiveSession.mockResolvedValue({ ...session, listingId: "linked-ad" });
  let reject;
  saved.toggle.mockReturnValue(
    new Promise((resolve, no) => {
      reject = no;
    }),
  );
  render(<LiveViewer />);
  await screen.findByTestId("live-player");
  const heart = screen.getByRole("button", { name: "Save linked ad" });
  fireEvent.click(heart);
  fireEvent.click(heart);
  expect(saved.toggle).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("Save failed")));
  expect(screen.getByRole("alert").textContent).toContain("Save failed");
  expect(heart.disabled).toBe(false);
});

test("server time protects a live session from client clock skew and nullable viewers stay unknown", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2030-01-01T00:00:00Z"));
  getLiveSession.mockResolvedValue({
    ...session,
    serverTime: "2026-10-24T12:00:00Z",
    endsAt: "2026-10-24T12:10:00Z",
    viewerCount: null,
  });
  render(<LiveViewer />);
  expect(await screen.findByTestId("live-player")).toBeTruthy();
  expect(screen.queryByText("This live session has ended")).toBeNull();
  expect(
    screen.getByLabelText("Viewer count unavailable").textContent,
  ).toContain("\u2014");
  getLiveSession.mockResolvedValue({
    ...session,
    serverTime: "2026-10-24T12:01:00Z",
    endsAt: "2026-10-24T12:10:00Z",
    viewerCount: 7,
  });
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(screen.getByLabelText("7 viewers")).toBeTruthy();
});
