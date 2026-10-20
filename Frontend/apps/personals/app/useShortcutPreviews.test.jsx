import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import useShortcutPreviews from "./useShortcutPreviews.js";
import { listLiveCreators } from "@vezlist/shared/lib/api/live.js";
import { featuredListings } from "@vezlist/shared/lib/api/featured.js";
import { getTrendingSellers } from "@vezlist/shared/lib/api/sellers.js";
import { mapPins } from "@vezlist/shared/lib/api/discovery.js";

vi.mock("@vezlist/shared/lib/api/live.js", () => ({
  listLiveCreators: vi.fn(),
}));
vi.mock("@vezlist/shared/lib/api/featured.js", () => ({
  featuredListings: vi.fn(),
}));
vi.mock("@vezlist/shared/lib/api/sellers.js", () => ({
  getTrendingSellers: vi.fn(),
}));
vi.mock("@vezlist/shared/lib/api/discovery.js", () => ({ mapPins: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-20T09:00:00Z"));
  vi.clearAllMocks();
  document.documentElement.dataset.ageGate = "ok";
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  listLiveCreators.mockResolvedValue({
    total: 2,
    items: [{ imageUrl: "live.jpg" }, { avatarUrl: "avatar.jpg" }],
  });
  featuredListings.mockImplementation(async (feed) => ({
    items: feed === "AVAILABLE_NOW" ? [{ imageUrl: "available.jpg" }] : [],
  }));
  getTrendingSellers.mockResolvedValue([{ coverUrl: "trending.jpg" }]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.ageGate;
});

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

test("availability uses the backend total rather than just the preview photo count", async () => {
  featuredListings.mockResolvedValue({ total: 12, items: [{ imageUrl: "available.jpg" }] });
  const { result } = renderHook(useShortcutPreviews);
  await flush();
  expect(result.current.available).toEqual({ stat: "12 available", count: 12, thumbs: ["available.jpg"] });
});

test("uses real destination data, caps unique circles at four, and represents empty feeds honestly", async () => {
  getTrendingSellers.mockResolvedValue(
    Array.from({ length: 30 }, (_, i) => ({ coverUrl: `${i % 6}.jpg` })),
  );
  const { result } = renderHook(useShortcutPreviews);
  await flush();
  expect(listLiveCreators).toHaveBeenCalledWith(4, {
    signal: expect.any(AbortSignal),
  });
  expect(featuredListings).toHaveBeenCalledWith("AVAILABLE_NOW", {
    signal: expect.any(AbortSignal),
  });
  expect(featuredListings).toHaveBeenCalledWith("NEW_TODAY", {
    signal: expect.any(AbortSignal),
  });
  expect(result.current.live).toEqual({
    stat: "2 live",
    thumbs: ["live.jpg", "avatar.jpg"],
    count: 2,
  });
  expect(result.current.available.thumbs).toEqual(["available.jpg"]);
  expect(result.current.new).toEqual({
    stat: "0 new today",
    thumbs: [],
    count: 0,
  });
  expect(result.current.trending.stat).toBe("30+ creators");
  expect(result.current.trending.thumbs).toEqual([
    "0.jpg",
    "1.jpg",
    "2.jpg",
    "3.jpg",
  ]);
});

test("polls live at 15 seconds, other feeds at 30, and removes ended or deleted results", async () => {
  const { result } = renderHook(useShortcutPreviews);
  await flush();
  listLiveCreators.mockResolvedValue({ total: 0, items: [] });
  featuredListings.mockResolvedValue({ items: [] });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(result.current.live).toEqual({ stat: "0 live", thumbs: [], count: 0 });
  expect(featuredListings).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(featuredListings).toHaveBeenCalledTimes(4);
  expect(result.current.available.thumbs).toEqual([]);
});

test("clears stale failed previews without losing successful feeds or pretending failure means zero", async () => {
  const { result } = renderHook(useShortcutPreviews);
  await flush();
  listLiveCreators.mockRejectedValue(new Error("offline"));
  featuredListings.mockImplementation(async (feed) => {
    if (feed === "AVAILABLE_NOW") throw new Error("unavailable");
    return { items: [{ imageUrl: "new.jpg" }] };
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(result.current.live).toBeNull();
  expect(result.current.available).toBeNull();
  expect(result.current.new.thumbs).toEqual(["new.jpg"]);
  expect(result.current.trending.thumbs).toEqual(["trending.jpg"]);
});

test("waits for the age gate, pauses in background, resumes on visibility, and cleans up", async () => {
  document.documentElement.dataset.ageGate = "gate";
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  const { unmount } = renderHook(useShortcutPreviews);
  await flush();
  expect(listLiveCreators).not.toHaveBeenCalled();
  await act(async () => {
    document.documentElement.dataset.ageGate = "ok";
  });
  await flush();
  expect(listLiveCreators).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(listLiveCreators).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await flush();
  expect(listLiveCreators).toHaveBeenCalledTimes(2);
  unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(listLiveCreators).toHaveBeenCalledTimes(2);
});

test("never prompts for geolocation; shows nearby count only after permission is granted", async () => {
  const query = vi.fn().mockResolvedValue({ state: "prompt" });
  const getCurrentPosition = vi.fn((success) =>
    success({ coords: { latitude: 43.65, longitude: -79.38 } }),
  );
  vi.stubGlobal("navigator", {
    permissions: { query },
    geolocation: { getCurrentPosition },
  });
  mapPins.mockResolvedValue([{ id: "nearby" }]);
  const { result } = renderHook(useShortcutPreviews);
  await flush();
  expect(getCurrentPosition).not.toHaveBeenCalled();
  expect(result.current.nearby).toBeNull();
  query.mockResolvedValue({ state: "granted" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(mapPins).toHaveBeenCalledWith(
    {
      site: "PERSONALS",
      latitude: 43.65,
      longitude: -79.38,
      radiusKm: 5,
      limit: 500,
    },
    { signal: expect.any(AbortSignal) },
  );
  expect(result.current.nearby).toEqual({ stat: "Within 5 km", count: 1 });
});

test("aborts stalled requests, retries, and ignores late responses from the old request", async () => {
  let finishOldRequest;
  listLiveCreators.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOldRequest = resolve;
      }),
  );
  const { result, unmount } = renderHook(useShortcutPreviews);
  await flush();
  const signal = listLiveCreators.mock.calls[0][1].signal;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(12_000);
  });
  expect(signal.aborted).toBe(true);
  expect(result.current.live).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(listLiveCreators).toHaveBeenCalledTimes(2);
  expect(result.current.live.stat).toBe("2 live");
  await act(async () => {
    finishOldRequest({ total: 99, items: [] });
  });
  expect(result.current.live.stat).toBe("2 live");
  unmount();
  expect(listLiveCreators.mock.calls[1][1].signal.aborted).toBe(true);
});
