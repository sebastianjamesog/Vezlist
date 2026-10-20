"use client";

import { useCallback, useEffect, useState } from "react";
import { listLiveCreators } from "@vezlist/shared/lib/api/live.js";
import { featuredListings } from "@vezlist/shared/lib/api/featured.js";
import { getTrendingSellers } from "@vezlist/shared/lib/api/sellers.js";
import { mapPins } from "@vezlist/shared/lib/api/discovery.js";

const TRENDING_LIMIT = 30;
const NEARBY_LIMIT = 500;

function photos(rows, cover = "imageUrl") {
  return [
    ...new Set(rows.map((row) => row[cover] || row.avatarUrl).filter(Boolean)),
  ].slice(0, 4);
}

/** Match the map's initial 5 km radius, without prompting for location on home. */
async function nearbyPreview(signal) {
  if (!navigator.permissions || !navigator.geolocation) return null;
  const permission = await navigator.permissions.query({ name: "geolocation" });
  signal.throwIfAborted();
  if (permission.state !== "granted") return null;
  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 300_000,
      timeout: 8_000,
    });
  });
  signal.throwIfAborted();
  const pins = await mapPins(
    {
      site: "PERSONALS",
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      radiusKm: 5,
      limit: NEARBY_LIMIT,
    },
    { signal },
  );
  const count = pins.length >= NEARBY_LIMIT ? `${NEARBY_LIMIT}+` : pins.length;
  return { stat: "Within 5 km", count };
}

/** One request at a time; pause behind the age gate or in background tabs. */
function usePreviewRefresh(load, intervalMs, onResult) {
  useEffect(() => {
    let disposed = false;
    let pending = false;
    let timer;
    let controller;
    let lastAttempt = 0;
    const visible = () =>
      document.visibilityState !== "hidden" &&
      document.documentElement.dataset.ageGate === "ok";
    async function refresh() {
      if (disposed || pending || !visible()) return;
      clearTimeout(timer);
      // Focus and visibility events often arrive together.
      if (Date.now() - lastAttempt < 1_000) {
        timer = setTimeout(refresh, 1_000);
        return;
      }
      pending = true;
      lastAttempt = Date.now();
      controller = new AbortController();
      const signal = controller.signal;
      let rejectOnAbort;
      const aborted = new Promise((_, reject) => {
        rejectOnAbort = () => reject(new Error("Preview request cancelled"));
        signal.addEventListener("abort", rejectOnAbort, { once: true });
      });
      const deadline = setTimeout(() => controller.abort(), 12_000);
      try {
        const result = await Promise.race([load(signal), aborted]);
        if (!disposed) onResult(result);
      } catch {
        if (!disposed) onResult(null);
      } finally {
        clearTimeout(deadline);
        signal.removeEventListener("abort", rejectOnAbort);
        pending = false;
        if (!disposed && visible()) timer = setTimeout(refresh, intervalMs);
      }
    }
    const resume = () => {
      clearTimeout(timer);
      if (visible()) refresh();
    };
    const gate = new MutationObserver(resume);
    gate.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-age-gate"],
    });
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    refresh();
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timer);
      gate.disconnect();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [load, intervalMs, onResult]);
}

async function loadLive(signal) {
  const directory = await listLiveCreators(4, { signal });
  return {
    stat: `${directory.total} live`,
    thumbs: photos(directory.items ?? []),
    count: directory.total,
  };
}

async function loadFeeds(signal) {
  // These are the same sources as the shortcut destinations. In particular,
  // New Today uses rotating slots; Available Now uses current availability.
  const jobs = [
    [
      "available",
      () => featuredListings("AVAILABLE_NOW", { signal }),
      (page) => ({
        stat: `${page.total ?? page.items.length} available`,
        thumbs: photos(page.items),
        count: page.total ?? page.items.length,
      }),
    ],
    [
      "new",
      () => featuredListings("NEW_TODAY", { signal }),
      (page) => ({
        stat: `${page.items.length} new today`,
        thumbs: photos(page.items),
        count: page.items.length,
      }),
    ],
    [
      "trending",
      () =>
        getTrendingSellers({
          site: "PERSONALS",
          limit: TRENDING_LIMIT,
          signal,
        }),
      (rows) => ({
        stat: `${rows.length >= TRENDING_LIMIT ? `${TRENDING_LIMIT}+` : rows.length} creators`,
        thumbs: photos(rows, "coverUrl"),
        count:
          rows.length >= TRENDING_LIMIT ? `${TRENDING_LIMIT}+` : rows.length,
      }),
    ],
    ["nearby", () => nearbyPreview(signal), (preview) => preview],
  ];
  const results = await Promise.allSettled(
    jobs.map(async ([, fetch, map]) => map(await fetch())),
  );
  return Object.fromEntries(
    jobs.map(([key], index) => [
      key,
      results[index].status === "fulfilled" ? results[index].value : null,
    ]),
  );
}

export default function useShortcutPreviews() {
  const [previews, setPreviews] = useState({});
  const setLive = useCallback(
    (live) => setPreviews((current) => ({ ...current, live })),
    [],
  );
  const setFeeds = useCallback(
    (feeds) =>
      setPreviews((current) => ({
        ...current,
        available: null,
        new: null,
        trending: null,
        nearby: null,
        ...feeds,
      })),
    [],
  );
  usePreviewRefresh(loadLive, 15_000, setLive);
  usePreviewRefresh(loadFeeds, 30_000, setFeeds);
  return previews;
}
