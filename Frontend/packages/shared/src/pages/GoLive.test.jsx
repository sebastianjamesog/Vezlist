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
  default: ({ overlay }) => <div data-overlay={overlay}>Live chat</div>,
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

describe("Gcore creator live flow", () => {
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
      recordingPolicy: "NO_RECORDING",
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
    expect(screen.queryByText("Live chat")).toBeNull();
    expect(
      screen.getByText("Chat will connect when your broadcast is live."),
    ).toBeTruthy();
    live.getLiveSession.mockResolvedValue({ ...session, status: "LIVE" });
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(screen.getByText("Live chat")).toBeTruthy();
    const broadcastCard = screen.getByRole("region", {
      name: "Your live broadcast",
    });
    expect(broadcastCard.contains(screen.getByText("Live chat"))).toBe(true);
    expect(screen.getByText("Live chat").getAttribute("data-overlay")).toBe(
      "true",
    );
    expect(
      broadcastCard.contains(screen.getByRole("button", { name: "End Live" })),
    ).toBe(true);
    expect(
      broadcastCard.contains(
        screen.getByRole("button", { name: "Mute microphone" }),
      ),
    ).toBe(true);
    expect(
      screen.queryByText("Chat will connect when your broadcast is live."),
    ).toBeNull();
    live.getLiveSession.mockResolvedValue({
      ...session,
      status: "RECONNECTING",
    });
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(screen.getByText("Live chat")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Mute microphone" }));
    expect(tracks[1].enabled).toBe(false);
    await user.click(screen.getByRole("button", { name: "End Live" }));
    expect(live.endLiveSession).toHaveBeenCalledWith("session-1");
    expect(await screen.findByText("Your session has ended")).toBeTruthy();
    expect(screen.queryByText("Live chat")).toBeNull();
    expect(stopBroadcast).toHaveBeenCalled();
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(tracks[1].stop).toHaveBeenCalled();
    unmount();
  });

  test("missing streaming configuration prevents any session creation", async () => {
    live.listLivePlans.mockResolvedValue({
      items: [plan],
      streamingAvailable: false,
      demoPurchaseAvailable: true,
      recordingPolicy: "NO_RECORDING",
      unavailableReason: "Live streaming is not configured yet.",
    });
    await reachCheckout();
    expect(
      screen.getByText("Live streaming is not configured yet."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Demo purchase & go live" }).disabled,
    ).toBe(true);
    expect(live.createLiveSession).not.toHaveBeenCalled();
  });

  test("checkout refreshes readiness after configuration changes without reopening the camera", async () => {
    const ready = {
      items: [plan],
      streamingAvailable: true,
      demoPurchaseAvailable: true,
      recordingPolicy: "NO_RECORDING",
    };
    live.listLivePlans.mockResolvedValue(ready).mockResolvedValueOnce({
      ...ready,
      streamingAvailable: false,
      unavailableReason: "Waiting for configuration.",
    });
    await reachCheckout();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Demo purchase & go live" })
          .disabled,
      ).toBe(false),
    );
    expect(live.listLivePlans).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Waiting for configuration.")).toBeNull();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(tracks[0].stop).not.toHaveBeenCalled();
    expect(live.getLivePaymentDetails).toHaveBeenCalledTimes(1);
    expect(live.createLiveSession).not.toHaveBeenCalled();
    expect(openBrowserBroadcast).not.toHaveBeenCalled();
  });

  test("focus refresh enables the selected plan and cleans up on leaving checkout", async () => {
    const catalog = {
      items: [plan],
      streamingAvailable: false,
      demoPurchaseAvailable: true,
      recordingPolicy: "NO_RECORDING",
    };
    live.listLivePlans.mockResolvedValue(catalog);
    const { user, unmount } = await reachCheckout();
    live.listLivePlans.mockResolvedValue({
      ...catalog,
      streamingAvailable: true,
    });
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(
      screen.getByRole("button", { name: "Demo purchase & go live" }).disabled,
    ).toBe(false);
    expect(screen.getByText("Quick live")).toBeTruthy();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(tracks[0].stop).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Back" })[0]);
    const calls = live.listLivePlans.mock.calls.length;
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(live.listLivePlans).toHaveBeenCalledTimes(calls);
    unmount();
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    expect(live.listLivePlans).toHaveBeenCalledTimes(calls);
    expect(live.createLiveSession).not.toHaveBeenCalled();
  });

  test("failed readiness refresh blocks starting until a successful manual check", async () => {
    const { user } = await reachCheckout();
    live.listLivePlans.mockRejectedValueOnce(new Error("Offline"));
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not check live availability",
    );
    expect(
      screen.getByRole("button", { name: "Demo purchase & go live" }).disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Check live status" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Demo purchase & go live" })
          .disabled,
      ).toBe(false),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(live.createLiveSession).not.toHaveBeenCalled();
  });

  test("waiting checkout polls availability and ignores an in-flight result after unmount", async () => {
    const intervals = vi.spyOn(globalThis, "setInterval");
    const clear = vi.spyOn(globalThis, "clearInterval");
    const catalog = {
      items: [plan],
      streamingAvailable: false,
      demoPurchaseAvailable: true,
    };
    live.listLivePlans.mockResolvedValue(catalog);
    const { unmount } = await reachCheckout();
    const timerIndex = intervals.mock.calls.findIndex(
      ([, delay]) => delay === 10000,
    );
    expect(timerIndex).toBeGreaterThanOrEqual(0);
    const refresh = intervals.mock.calls[timerIndex][0];
    let resolve;
    live.listLivePlans.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await act(async () => {
      refresh();
    });
    expect(
      screen.getByRole("button", { name: "Demo purchase & go live" }).disabled,
    ).toBe(true);
    unmount();
    expect(clear).toHaveBeenCalledWith(
      intervals.mock.results[timerIndex].value,
    );
    await act(async () => resolve({ ...catalog, streamingAvailable: true }));
    expect(live.createLiveSession).not.toHaveBeenCalled();
    expect(openBrowserBroadcast).not.toHaveBeenCalled();
    intervals.mockRestore();
    clear.mockRestore();
  });

  test("refreshed plan terms require another selection instead of silently authorizing the new price", async () => {
    await reachCheckout();
    live.listLivePlans.mockResolvedValue({
      items: [{ ...plan, version: 4, price: 30 }],
      streamingAvailable: true,
      demoPurchaseAvailable: true,
    });
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(screen.getByRole("alert").textContent).toContain(
      "Your plan changed",
    );
    expect(screen.getByRole("radio", { name: /Quick live/ }).checked).toBe(
      false,
    );
    expect(
      screen.queryByRole("button", { name: "Demo purchase & go live" }),
    ).toBeNull();
    expect(tracks[0].stop).not.toHaveBeenCalled();
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

  test("uses server time for expiry warnings on a restored live session", async () => {
    const serverTime = "2020-01-01T00:00:00Z";
    const current = {
      ...session,
      status: "LIVE",
      serverTime,
      endsAt: "2020-01-01T00:04:00Z",
    };
    live.getMyLiveSession.mockResolvedValue({ session: current });
    live.getLiveSession.mockResolvedValue(current);
    render(<GoLive />);
    expect(await screen.findByRole("timer")).toHaveProperty(
      "textContent",
      "04:00",
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "5 minutes or less",
    );
    expect(screen.getByRole("button", { name: "End Live" })).toBeTruthy();
    live.getLiveSession.mockResolvedValue({
      ...current,
      endsAt: "2020-01-01T00:00:45Z",
    });
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(screen.getByRole("alert").textContent).toContain("1 minute or less");
    expect(screen.getByRole("timer").textContent).toBe("00:45");
    live.getLiveSession.mockResolvedValue({
      ...current,
      endsAt: "2019-12-31T23:59:59Z",
    });
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(screen.getByText("Your session has ended")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "End Live" })).toBeNull();
  });

  test("closing creator controls asks before ending the live", async () => {
    const user = userEvent.setup();
    live.getMyLiveSession.mockResolvedValue({
      session: { ...session, status: "LIVE" },
    });
    render(<GoLive />);
    await user.click(
      await screen.findByRole("button", { name: "End live and leave" }),
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "End live and leave?",
    );
    expect(live.endLiveSession).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(live.endLiveSession).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
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
