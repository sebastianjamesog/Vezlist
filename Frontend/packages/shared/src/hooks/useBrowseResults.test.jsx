import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import useBrowseResults from "./useBrowseResults.js";
import { searchListings } from "../lib/api/discovery.js";
vi.mock("../lib/api/discovery.js", () => ({ searchListings: vi.fn() }));
beforeEach(() => searchListings.mockReset());

test("restores loaded pages and scroll on return, but resets when filters change", async () => {
  const cache = { current: null };
  searchListings
    .mockResolvedValueOnce({
      items: [{ id: "one" }],
      hasMore: true,
      nextCursor: "next",
    })
    .mockResolvedValueOnce({ items: [{ id: "two" }], hasMore: false });
  const first = renderHook(() =>
    useBrowseResults({ site: "PERSONALS" }, cache),
  );
  await waitFor(() => expect(first.result.current.loading).toBe(false));
  act(() => first.result.current.loadMore());
  await waitFor(() => expect(first.result.current.items).toHaveLength(2));
  first.result.current.scroll.top = 650;
  first.unmount();
  const second = renderHook(
    ({ province }) => useBrowseResults({ site: "PERSONALS", province }, cache),
    { initialProps: {} },
  );
  expect(second.result.current.items).toHaveLength(2);
  expect(second.result.current.scroll.top).toBe(650);
  expect(searchListings).toHaveBeenCalledTimes(2);
  searchListings.mockResolvedValueOnce({ items: [], hasMore: false });
  second.rerender({ province: "on" });
  await waitFor(() => expect(second.result.current.loading).toBe(false));
  expect(second.result.current.items).toEqual([]);
  expect(second.result.current.scroll.top).toBe(0);
});

test("late pagination from an old filter never enters the new result list", async () => {
  let finishOld;
  searchListings
    .mockResolvedValueOnce({
      items: [{ id: "old" }],
      hasMore: true,
      nextCursor: "next",
    })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    )
    .mockResolvedValueOnce({ items: [{ id: "new" }] });
  const { result, rerender } = renderHook(
    ({ province }) => useBrowseResults({ province }),
    { initialProps: { province: "on" } },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.loadMore());
  rerender({ province: "bc" });
  await waitFor(() => expect(result.current.items).toEqual([{ id: "new" }]));
  await act(async () => finishOld({ items: [{ id: "stale" }] }));
  expect(result.current.items).toEqual([{ id: "new" }]);
});

test("an expired cache fetches current ads instead of retaining deleted rows indefinitely", async () => {
  const cache = {
    current: {
      key: JSON.stringify({ site: "PERSONALS" }),
      updatedAt: Date.now() - 61_000,
      items: [{ id: "deleted" }],
      loading: false,
      scroll: { top: 100 },
    },
  };
  searchListings.mockResolvedValueOnce({ items: [] });
  const { result } = renderHook(() =>
    useBrowseResults({ site: "PERSONALS" }, cache),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.items).toEqual([]);
  expect(searchListings).toHaveBeenCalledOnce();
});
