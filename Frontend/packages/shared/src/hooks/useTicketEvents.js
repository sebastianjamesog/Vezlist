"use client";

import { useEffect, useRef } from "react";
import { API_BASE_URL, SITE_SCOPE } from "../lib/api/client.js";

// A list and its open conversation share one stream per account and board.
const streams = new Map();

function subscribe({ staff, site, accountId }, listener) {
  const key = `${staff ? "admin" : "me"}:${accountId}:${site}`;
  let stream = streams.get(key);
  if (!stream) {
    const listeners = new Set();
    let source;
    let retry;
    let attempts = 0;
    let stopped = false;
    const emit = (event = { ticketId: null }) => {
      if (!stopped && document.visibilityState !== "hidden") {
        for (const callback of listeners) callback(event);
      }
    };
    const disconnect = () => {
      clearTimeout(retry);
      source?.close();
      source = null;
    };
    const connect = () => {
      disconnect();
      if (stopped || document.visibilityState === "hidden" || typeof EventSource === "undefined") return;
      const path = `/api/v1/${staff ? "admin" : "me"}/tickets/events`;
      const current = new EventSource(`${API_BASE_URL}${path}?site=${encodeURIComponent(site)}`, { withCredentials: true });
      source = current;
      current.addEventListener("tickets-changed", (event) => {
        if (source !== current || stopped) return;
        attempts = 0;
        try {
          const data = JSON.parse(event.data);
          if (data && (data.ticketId == null || typeof data.ticketId === "string")) emit(data);
        } catch { /* Ignore malformed invalidations; periodic reconciliation recovers. */ }
      });
      current.onerror = () => {
        if (source !== current || stopped) return;
        disconnect();
        retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)));
      };
    };
    const wake = () => {
      if (document.visibilityState === "hidden") disconnect();
      else {
        if (!source) connect();
        emit();
      }
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    // Recover missed notifications or proxies that interrupt streaming.
    const reconcile = setInterval(() => emit(), 30000);
    stream = { listeners, close() {
      stopped = true;
      disconnect();
      clearInterval(reconcile);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
    } };
    streams.set(key, stream);
    connect();
  }
  stream.listeners.add(listener);
  return () => {
    stream.listeners.delete(listener);
    if (!stream.listeners.size) {
      stream.close();
      streams.delete(key);
    }
  };
}

export function useTicketEvents({ staff = false, site = SITE_SCOPE, accountId, onChange }) {
  const callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    if (!accountId || !site) return;
    return subscribe({ staff, site, accountId }, (event) => callback.current?.(event));
  }, [staff, site, accountId]);
}
