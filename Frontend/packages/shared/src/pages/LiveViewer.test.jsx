import { beforeEach, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { setRoute } from "../../../../testing/stubs/next-navigation.js";
import { getLiveSession } from "../lib/api/live";
import LiveViewer from "./LiveViewer";
vi.mock("../lib/api/live", () => ({ getLiveSession: vi.fn() }));
vi.mock("../components/live/LivePlayer", () => ({
  default: ({ playbackUrl, immersive }) => (
    <div data-testid="live-player" data-immersive={immersive}>
      {playbackUrl}
    </div>
  ),
}));
vi.mock("../components/live/LiveChat", () => ({
  default: ({ overlay }) => <div data-overlay={overlay}>Live chat</div>,
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
  expect(
    screen.getByText("Watching is free. Join the conversation above."),
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
