import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import useEthnicities from "./useEthnicities.js";
import { getEthnicities } from "../lib/api/catalog.js";
vi.mock("../lib/api/catalog.js", () => ({ getEthnicities: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

test("concurrent forms and filters share a request and use current values on focus", async () => {
  getEthnicities.mockResolvedValue([{ id: "a", label: "Original" }]);
  const first = renderHook(() => useEthnicities());
  const second = renderHook(() => useEthnicities());
  await waitFor(() => expect(second.result.current.status).toBe("success"));
  expect(getEthnicities).toHaveBeenCalledTimes(1);
  expect(first.result.current.ethnicities).toEqual(
    second.result.current.ethnicities,
  );
  getEthnicities.mockResolvedValue([{ id: "b", label: "Updated" }]);
  await act(async () => window.dispatchEvent(new Event("focus")));
  await waitFor(() =>
    expect(first.result.current.ethnicities[0]?.label).toBe("Updated"),
  );
  expect(second.result.current.ethnicities[0].label).toBe("Updated");
  expect(getEthnicities).toHaveBeenCalledTimes(2);
});

test("a closed picker response cannot replace the catalog from a reopened picker", async () => {
  let finishOld;
  getEthnicities.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      }),
  );
  const { result, rerender } = renderHook(
    ({ enabled }) => useEthnicities({ enabled }),
    { initialProps: { enabled: true } },
  );
  await waitFor(() => expect(getEthnicities).toHaveBeenCalledTimes(1));
  rerender({ enabled: false });
  getEthnicities.mockResolvedValue([{ id: "new", label: "Current" }]);
  rerender({ enabled: true });
  await waitFor(() =>
    expect(result.current.ethnicities[0]?.label).toBe("Current"),
  );
  await act(async () => finishOld([{ id: "old", label: "Stale" }]));
  expect(result.current.ethnicities).toEqual([{ id: "new", label: "Current" }]);
});

test("failed refresh removes stale offered choices and retry reads the server", async () => {
  getEthnicities
    .mockResolvedValueOnce([{ id: "old", label: "Old" }])
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue([]);
  const { result } = renderHook(() => useEthnicities());
  await waitFor(() => expect(result.current.status).toBe("success"));
  await act(async () => result.current.retry());
  expect(result.current.status).toBe("error");
  expect(result.current.ethnicities).toEqual([]);
  await act(async () => result.current.retry());
  expect(result.current.status).toBe("success");
  expect(result.current.ethnicities).toEqual([]);
});
