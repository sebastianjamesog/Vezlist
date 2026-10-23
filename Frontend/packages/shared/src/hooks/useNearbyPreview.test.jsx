import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import useNearbyPreview, { rememberNearbyPosition } from "./useNearbyPreview.js";
import { searchListings } from "../lib/api/discovery.js";
vi.mock("../lib/api/discovery.js", () => ({ searchListings: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-23T12:00:00Z")); vi.clearAllMocks();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  searchListings.mockResolvedValue({items:[{id:"one",imageUrl:"one.jpg"}],hasMore:false});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
test("explicitly denied location never requests a position even with previously cached coordinates", async () => {
  rememberNearbyPosition({coords:{latitude:43,longitude:-79}});
  const getCurrentPosition=vi.fn();
  vi.stubGlobal("navigator",{permissions:{query:vi.fn().mockResolvedValue({state:"denied"})},geolocation:{getCurrentPosition}});
  const {result}=renderHook(() => useNearbyPreview()); await flush();
  expect(result.current).toBeNull(); expect(getCurrentPosition).not.toHaveBeenCalled(); expect(searchListings).not.toHaveBeenCalled();
});
test("unsupported permission API reuses explicit-visit coordinates without prompting and stops after five minutes",async () => {
  rememberNearbyPosition({coords:{latitude:43,longitude:-79}});
  const getCurrentPosition=vi.fn(); vi.stubGlobal("navigator",{geolocation:{getCurrentPosition}});
  const {result}=renderHook(() => useNearbyPreview()); await flush();
  expect(result.current.thumbs).toEqual(["one.jpg"]); expect(getCurrentPosition).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(300000); });
  expect(result.current).toBeNull(); expect(getCurrentPosition).not.toHaveBeenCalled();
});
test("aborts a stalled preview and can refresh afterward",async () => {
  vi.stubGlobal("navigator",{permissions:{query:vi.fn().mockResolvedValue({state:"granted"})},geolocation:{getCurrentPosition:vi.fn(success => success({coords:{latitude:43,longitude:-79}}))}});
  searchListings.mockImplementationOnce((params,{signal}) => new Promise((resolve,reject) => signal.addEventListener("abort",()=>reject(new Error("aborted")))));
  const {result}=renderHook(() => useNearbyPreview()); await flush();
  const signal=searchListings.mock.calls[0][1].signal;
  await act(async () => {await vi.advanceTimersByTimeAsync(10000);}); expect(signal.aborted).toBe(true);
  await act(async () => {await vi.advanceTimersByTimeAsync(20000);}); expect(result.current.count).toBe(1);
});
