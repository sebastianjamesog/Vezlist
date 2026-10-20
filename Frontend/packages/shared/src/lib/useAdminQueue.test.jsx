import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useAdminQueue } from "./useAdminQueue";

test("can reach reports after a full first page of other case kinds", async () => {
  const fetchPage = vi.fn().mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => ({ id: String(i), kind: "SUBMISSION" }))).mockResolvedValueOnce([{ id: "report", kind: "REPORT" }]);
  const { result } = renderHook(() => useAdminQueue("personals", fetchPage, "REPORT"));
  await waitFor(() => expect(result.current.rows).toEqual([]));
  expect(result.current.hasMore).toBe(true);
  await act(() => result.current.loadMore());
  expect(fetchPage).toHaveBeenLastCalledWith({ site: "PERSONALS", limit: 50, offset: 50 });
  expect(result.current.rows).toEqual([{ id: "report", kind: "REPORT" }]);
  expect(result.current.hasMore).toBe(false);
});
test("ignores a stale site's response when switching boards", async () => {
  let resolveOld;
  const fetchPage = vi.fn(({ site }) => site === "PERSONALS" ? new Promise((r) => { resolveOld = r; }) : Promise.resolve([{ id: "market" }]));
  const { result, rerender } = renderHook(({ site }) => useAdminQueue(site, fetchPage), { initialProps: { site: "personals" } });
  rerender({ site: "marketplace" });
  await waitFor(() => expect(result.current.rows).toEqual([{ id: "market" }]));
  await act(async () => resolveOld([{ id: "old" }]));
  expect(result.current.rows).toEqual([{ id: "market" }]);
});
