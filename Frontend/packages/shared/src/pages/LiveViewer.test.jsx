import { beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { setRoute } from "../../../../testing/stubs/next-navigation.js";
import { getLiveSession } from "../lib/api/live";
import LiveViewer from "./LiveViewer";
vi.mock("../lib/api/live", () => ({ getLiveSession: vi.fn() }));
vi.mock("../components/live/LivePlayer", () => ({
  default: ({ playbackUrl }) => (
    <div data-testid="live-player">{playbackUrl}</div>
  ),
}));
vi.mock("../components/live/LiveChat", () => ({
  default: () => <div>Live chat</div>,
}));
const session = {
  id: "session-1",
  ownerId: "creator-1",
  creatorName: "Alex",
  title: "Live session",
  status: "LIVE",
  playbackUrl: "https://stream.mux.com/live.m3u8?token=signed",
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
  expect(
    screen.getByText("Watch for free. Sign in to join the chat."),
  ).toBeTruthy();
  expect(screen.getByText("creator@example.com")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Alex" }).getAttribute("href")).toBe(
    "/seller/creator-1",
  );
  expect(screen.queryByText("hidden@example.com")).toBeNull();
});
test("preparing session shows truthful waiting state without video", async () => {
  getLiveSession.mockResolvedValue({ ...session, status: "PREPARING" });
  render(<LiveViewer />);
  expect(await screen.findByText("The creator is getting ready")).toBeTruthy();
  expect(screen.queryByTestId("live-player")).toBeNull();
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
