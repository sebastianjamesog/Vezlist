"use client";
import { useEffect, useState } from "react";
import { searchListings } from "../lib/api/discovery.js";
import { SITE_SCOPE } from "../lib/api/client.js";

// Ephemeral coordinates from an explicit Nearby visit, never localStorage.
let recentPosition = null;
export function rememberNearbyPosition(position) {
  recentPosition = { latitude: position.coords.latitude, longitude: position.coords.longitude, at: Date.now() };
}
export default function useNearbyPreview({ site = SITE_SCOPE, waitForAgeGate = false } = {}) {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    let disposed = false;
    let pending = false;
    let controller;
    const visible = () => document.visibilityState !== "hidden" &&
      (!waitForAgeGate || document.documentElement.dataset.ageGate === "ok");
    async function refresh() {
      if (pending || !visible() || !navigator.geolocation) return;
      pending = true;
      let deadline;
      try {
        let permission = null;
        if (navigator.permissions?.query) {
          try { permission = (await navigator.permissions.query({ name: "geolocation" })).state; }
          catch { /* Unsupported permission queries use explicit-visit coordinates only. */ }
        }
        if (disposed) return;
        let coords = null;
        if (permission === "granted") {
          const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject,
            { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 }));
          rememberNearbyPosition(position);
          coords = recentPosition;
        } else if (permission === null && recentPosition && Date.now() - recentPosition.at < 300000) {
          coords = recentPosition;
        }
        if (!coords) { if (!disposed) setPreview(null); return; }
        if (disposed) return;
        controller = new AbortController();
        deadline = setTimeout(() => controller.abort(), 10000);
        const page = await searchListings({ site, sort: "NEAREST", radiusKm: 5,
          latitude: coords.latitude, longitude: coords.longitude, limit: 24 }, { signal: controller.signal });
        if (!disposed) setPreview({ stat: "Within 5 km", count: page.hasMore ? `${page.items.length}+` : page.items.length,
          thumbs: [...new Set(page.items.map(item => item.imageUrl).filter(Boolean))].slice(0,4) });
      } catch { if (!disposed) setPreview(null); }
      finally { clearTimeout(deadline); pending = false; }
    }
    refresh();
    const timer = setInterval(refresh, 30000);
    const gate = waitForAgeGate ? new MutationObserver(refresh) : null;
    gate?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-age-gate"] });
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { disposed = true; controller?.abort(); clearInterval(timer); gate?.disconnect();
      window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [site, waitForAgeGate]);
  return preview;
}
