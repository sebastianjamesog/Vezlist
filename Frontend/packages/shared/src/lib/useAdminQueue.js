"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_SIZE = 50;

/** The staff APIs paginate independently for each board. Keep both offsets. */
export function useAdminQueue(site, fetchPage, kind) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pages = useRef({});
  const generation = useRef(0);

  const load = useCallback(async () => {
    const version = ++generation.current;
    const sites = site === "all" ? ["MARKETPLACE", "PERSONALS"] : [site.toUpperCase()];
    setRows(null);
    setError(null);
    setHasMore(false);
    setLoadingMore(false);
    try {
      const results = await Promise.all(sites.map(async (board) => {
        const items = await fetchPage({ site: board, limit: PAGE_SIZE, offset: 0 });
        return { board, items };
      }));
      if (version !== generation.current) return;
      pages.current = Object.fromEntries(results.map(({ board, items }) => [board, { offset: items.length, more: items.length === PAGE_SIZE }]));
      setRows(results.flatMap(({ items }) => kind ? items.filter((r) => r.kind === kind) : items));
      setHasMore(results.some(({ items }) => items.length === PAGE_SIZE));
    } catch (err) {
      if (version === generation.current) setError(err);
    }
  }, [site, fetchPage, kind]);

  useEffect(() => {
    load();
    return () => { generation.current += 1; };
  }, [load]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    const version = generation.current;
    setLoadingMore(true);
    setError(null);
    try {
      const results = await Promise.all(Object.entries(pages.current).filter(([, page]) => page.more).map(async ([board, page]) => ({
        board, offset: page.offset, items: await fetchPage({ site: board, limit: PAGE_SIZE, offset: page.offset }),
      })));
      if (version !== generation.current) return;
      for (const { board, offset, items } of results) pages.current[board] = { offset: offset + items.length, more: items.length === PAGE_SIZE };
      setRows((previous) => [...new Map([...previous, ...results.flatMap(({ items }) => kind ? items.filter((r) => r.kind === kind) : items)].map((r) => [r.id, r])).values()]);
      setHasMore(Object.values(pages.current).some((page) => page.more));
    } catch (err) {
      if (version === generation.current) setError(err);
    } finally {
      if (version === generation.current) setLoadingMore(false);
    }
  }

  return { rows, error, load, hasMore, loadingMore, loadMore };
}
