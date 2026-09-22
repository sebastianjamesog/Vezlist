"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const ATTRIBUTION =
  '<a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** MapLibre renders the vector basemap; Leaflet still owns pins and controls. */
export default function OpenFreeMapLayer({ onUnavailable }) {
  const map = useMap();

  useEffect(() => {
    onUnavailable(false);
    const layer = maplibreGL({
      style: STYLE_URL,
      // Leaflet displays this outside the canvas so it remains readable in
      // either theme, even before the remote style has finished loading.
      attributionControl: { customAttribution: ATTRIBUTION },
    });
    const unavailable = () => onUnavailable(true);

    try {
      layer.addTo(map);
    } catch {
      // WebGL initialization can fail on unsupported/disabled GPUs. The
      // adapter's normal onRemove assumes a renderer was created.
      if (!layer.getMaplibreMap()) {
        layer.onRemove = () => layer.getContainer()?.remove();
      }
      layer.remove();
      unavailable();
      return;
    }

    const renderer = layer.getMaplibreMap();
    // A MapLibre load/idle event can also mean failed tile requests finished.
    // Keep an error visible until an explicit retry creates a fresh layer.
    renderer.on("error", unavailable);

    return () => {
      renderer.off("error", unavailable);
      layer.remove();
    };
  }, [map, onUnavailable]);

  return null;
}
