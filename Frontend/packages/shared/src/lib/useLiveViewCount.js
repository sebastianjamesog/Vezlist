"use client";

import { useEffect, useState } from "react";
import { SITE_SCOPE } from "./api/client.js";
import { getListingViewCounts } from "./api/views.js";

const POLL_MS = 15_000;
const BATCH_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const groups = new Map();

function publish(group, id, count) {
  if (!Number.isFinite(count) || count < 0) return;
  const previous = group.counts.get(id);
  if (previous != null && count <= previous) return;
  group.counts.set(id, count);
  group.listeners.get(id)?.forEach((listener) => listener(count));
}

async function refresh(group) {
  if (group.inFlight || document.hidden || !group.listeners.size) return;
  const ids = [...group.listeners.keys()];
  group.inFlight = true;
  try {
    for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
      const counts = await getListingViewCounts(
        ids.slice(offset, offset + BATCH_SIZE),
        group.site,
      );
      for (const [id, count] of Object.entries(counts ?? {})) {
        if (group.listeners.has(id)) publish(group, id, count);
      }
    }
  } catch {
    // The current count stays visible; the next interval retries the read.
  } finally {
    group.inFlight = false;
    if (group.queued) {
      group.queued = false;
      schedule(group);
    }
  }
}

function schedule(group) {
  if (group.inFlight) {
    group.queued = true;
    return;
  }
  if (group.scheduled || document.hidden || !group.listeners.size) return;
  group.scheduled = setTimeout(() => {
    group.scheduled = null;
    refresh(group);
  }, 0);
}

function groupFor(site) {
  if (groups.has(site)) return groups.get(site);
  const group = {
    site,
    counts: new Map(),
    listeners: new Map(),
    inFlight: false,
    queued: false,
    scheduled: null,
    timer: null,
    onVisibility: null,
  };
  groups.set(site, group);
  return group;
}

function subscribe(site, id, listener) {
  const group = groupFor(site);
  if (!group.listeners.has(id)) group.listeners.set(id, new Set());
  group.listeners.get(id).add(listener);
  if (!group.timer) {
    group.timer = setInterval(() => refresh(group), POLL_MS);
    group.onVisibility = () => {
      if (!document.hidden) schedule(group);
    };
    document.addEventListener("visibilitychange", group.onVisibility);
  }
  schedule(group);
  return () => {
    const listeners = group.listeners.get(id);
    listeners?.delete(listener);
    if (!listeners?.size) group.listeners.delete(id);
    if (!group.listeners.size) {
      clearInterval(group.timer);
      clearTimeout(group.scheduled);
      document.removeEventListener("visibilitychange", group.onVisibility);
      groups.delete(site);
    }
  };
}

/** Push a newly recorded view to any visible card or detail page immediately. */
export function publishLiveViewCount(id, count, site = SITE_SCOPE) {
  const group = groups.get(site);
  if (group) publish(group, id, count);
}

/** All mounted cards share one 15-second batch poll per site. */
export default function useLiveViewCount(id, initialCount, site = SITE_SCOPE) {
  const [count, setCount] = useState(initialCount ?? null);

  useEffect(() => {
    if (!UUID.test(id ?? "")) {
      setCount(initialCount ?? null);
      return undefined;
    }
    const unsubscribe = subscribe(site, id, setCount);
    const group = groups.get(site);
    if (initialCount != null) publish(group, id, initialCount);
    setCount(group.counts.get(id) ?? initialCount ?? null);
    return unsubscribe;
  }, [id, site]);

  useEffect(() => {
    const group = groups.get(site);
    if (group && UUID.test(id ?? "") && initialCount != null) {
      publish(group, id, initialCount);
    } else if (!UUID.test(id ?? "")) {
      setCount(initialCount ?? null);
    }
  }, [id, initialCount, site]);

  return count;
}
