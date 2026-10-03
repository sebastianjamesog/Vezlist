import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GoLive from "./GoLive";
import { ownedListings } from "../lib/api/listings";
import * as live from "../lib/api/live";
import { openBrowserBroadcast } from "../components/live/browserBroadcast";
const navigate = vi.fn();
const account = { signedIn: true, can: () => true };
vi.mock("../lib/nav", () => ({ useNavigate: () => navigate }));
vi.mock("../context/AccountContext", () => ({ useAccount: () => account }));
vi.mock("../lib/api/listings", () => ({ ownedListings: vi.fn() }));
vi.mock("../lib/api/live", () => ({
  createLiveSession: vi.fn(),
  endLiveSession: vi.fn(),
  getBroadcastTicket: vi.fn(),
  getLivePaymentDetails: vi.fn(),
  getLiveSession: vi.fn(),
  getMyLiveSession: vi.fn(),
  listLivePlans: vi.fn(),
  saveLivePaymentDetails: vi.fn(),
}));
vi.mock("../components/live/browserBroadcast", () => ({
  broadcastMimeType: () => "video/webm;codecs=vp8,opus",
  openBrowserBroadcast: vi.fn(),
}));
vi.mock("../components/live/LiveChat", () => ({
  default: () => <div>Live chat</div>,
}));
vi.mock("../components/create/StoryComposer", () => ({
  default: () => <div>Post Story</div>,
}));
const plan = {
  id: "plan-1",
  name: "Quick live",
  durationMinutes: 10,
  price: 15,
  currency: "CAD",
  enabled: true,
  version: 3,
};
const payment = {
  items: ["INTERAC", "PAYPAL", "GPAY"].map((method) => ({
    method,
    details: "",
    enabled: false,
  })),
};
const session = {
  id: "session-1",
  status: "PREPARING",
  title: "My live session",
  durationMinutes: 10,
  createdAt: "2026-10-04T00:00:00Z",
};
let tracks;
const stopBroadcast = vi.fn();
async function reachCheckout() {
  const user = userEvent.setup();
  const result = render(<GoLive />);
  await user.click(
    await screen.findByRole("button", { name: /Start a live session/ }),
  );
  await user.click(screen.getByRole("radio", { name: /Quick live/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(
    screen.getByRole("button", { name: "Test camera & microphone" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Continue to Payment" }).disabled,
    ).toBe(false),
  );
  await user.click(screen.getByRole("button", { name: "Continue to Payment" }));
  return { user, ...result };
}

describe("Mux creator live flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    account.signedIn = true;
    account.can = () => true;
    tracks = [
      { stop: vi.fn(), enabled: true, readyState: "live" },
      { stop: vi.fn(), enabled: true, readyState: "live" },
    ];
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => tracks,
          getVideoTracks: () => [tracks[0]],
          getAudioTracks: () => [tracks[1]],
        }),
      },
    });
    ownedListings.mockResolvedValue([]);
    live.listLivePlans.mockResolvedValue({
      items: [plan],
      streamingAvailable: true,
      demoPurchaseAvailable: true,
      recordingPolicy: "LIVE_ONLY",
    });
    live.getLivePaymentDetails.mockResolvedValue(payment);
    live.saveLivePaymentDetails.mockResolvedValue(payment);
    live.getMyLiveSession.mockResolvedValue({ session: null });
    live.createLiveSession.mockResolvedValue(session);
    live.getLiveSession.mockResolvedValue(session);
    live.getBroadcastTicket.mockResolvedValue({
      ticket: "opaque",
      webSocketUrl: "ws://localhost:8080/api/v1/live/broadcast",
    });
    live.endLiveSession.mockResolvedValue({ ...session, status: "ENDED" });
    openBrowserBroadcast.mockImplementation(({ onState }) => {
      onState("transmitting");
      return { stop: stopBroadcast };
    });
  });

  test("creator with no ads starts an independent session after demo confirmation", async () => {
    const { user, unmount } = await reachCheckout();
    expect(screen.getByText("Demo purchase - no charge")).toBeTruthy();
    expect(ownedListings).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox", { name: "Your ad" })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Demo purchase & go live" }),
    );
    expect(live.createLiveSession).toHaveBeenCalledWith(
      {
        title: "Live session",
        planId: "plan-1",
        planVersion: 3,
        demoPurchase: true,
      },
      expect.any(String),
    );
    expect(openBrowserBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ ticket: "opaque", stream: expect.any(Object) }),
    );
    expect(screen.getByText("PREPARING")).toBeTruthy();
    expect(screen.queryByText("You're Live!")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Mute microphone" }));
    expect(tracks[1].enabled).toBe(false);
    await user.click(screen.getByRole("button", { name: "End Live" }));
    expect(live.endLiveSession).toHaveBeenCalledWith("session-1");
    expect(await screen.findByText("Your session has ended")).toBeTruthy();
    expect(stopBroadcast).toHaveBeenCalled();
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(tracks[1].stop).toHaveBeenCalled();
    unmount();
  });

  test("unconfirmed streaming policy prevents any session creation", async () => {
    live.listLivePlans.mockResolvedValue({
      items: [plan],
      streamingAvailable: false,
      demoPurchaseAvailable: true,
      recordingPolicy: "UNCONFIRMED",
      unavailableReason: "Streaming setup needs confirmation.",
    });
    await reachCheckout();
    expect(
      screen.getByText("Streaming setup needs confirmation."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Demo purchase & go live" }).disabled,
    ).toBe(true);
    expect(live.createLiveSession).not.toHaveBeenCalled();
  });

  test("network retry reuses idempotency key without duplicating the purchase request", async () => {
    live.createLiveSession.mockRejectedValueOnce(
      new Error("Network interrupted"),
    );
    const { user } = await reachCheckout();
    await user.click(
      screen.getByRole("button", { name: "Demo purchase & go live" }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Network interrupted",
    );
    await user.click(
      screen.getByRole("button", { name: "Demo purchase & go live" }),
    );
    expect(live.createLiveSession.mock.calls[0][1]).toBe(
      live.createLiveSession.mock.calls[1][1],
    );
  });

  test("stale admin plan requires selecting current plans again", async () => {
    live.createLiveSession.mockRejectedValue(
      Object.assign(new Error("Plan updated"), { status: 409 }),
    );
    const { user } = await reachCheckout();
    await user.click(
      screen.getByRole("button", { name: "Demo purchase & go live" }),
    );
    expect(
      await screen.findByText(/Your plan or session changed/),
    ).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Quick live/ }).checked).toBe(
      false,
    );
    expect(openBrowserBroadcast).not.toHaveBeenCalled();
  });

  test("camera permission failure prevents checkout", async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValue(
      Object.assign(new Error("Denied"), { name: "NotAllowedError" }),
    );
    const user = userEvent.setup();
    render(<GoLive />);
    await user.click(
      await screen.findByRole("button", {
        name: /Start a live session/,
      }),
    );
    await user.click(screen.getByRole("radio", { name: /Quick live/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      screen.getByRole("button", { name: "Test camera & microphone" }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Allow camera and microphone"),
    );
    expect(
      screen.getByRole("button", { name: "Continue to Payment" }).disabled,
    ).toBe(true);
  });

  test("guest cannot access creator APIs or camera", async () => {
    account.signedIn = false;
    render(<GoLive />);
    expect(screen.getByText("Creator accounts can go live")).toBeTruthy();
    await act(async () => {});
    expect(ownedListings).not.toHaveBeenCalled();
    expect(live.getMyLiveSession).not.toHaveBeenCalled();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});
