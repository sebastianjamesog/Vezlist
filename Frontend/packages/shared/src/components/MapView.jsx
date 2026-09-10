"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { LocateFixed } from "lucide-react";
import "leaflet/dist/leaflet.css";
import SearchBar from "./ui/SearchBar";

const VICTORIA = [48.4284, -123.3656];
const categoryGlyph = {
  vehicles: "Car",
  jobs: "Briefcase",
  property: "House",
  personals: "User",
};

// Inline paths rather than emoji: leaflet markers are raw HTML, and emoji
// glyphs depend on a font the browser may not have.
const glyphs = {
  House: "M12 3 2 12h3v8h5v-5h4v5h5v-8h3L12 3Z",
  Briefcase:
    "M9 4h6a2 2 0 0 1 2 2v1h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3V6a2 2 0 0 1 2-2Zm0 3h6V6H9v1Z",
  Car: "M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm10 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM3 15v-2l2-5h14l2 5v2h-2a3 3 0 0 0-6 0h-2a3 3 0 0 0-6 0H3Z",
  User: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 4.5V21h14v-2.5c0-2.5-3-4.5-7-4.5Z",
};

const pinIcon = (name) =>
  L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="display:grid;place-items:center;width:36px;height:36px;border-radius:14px 14px 14px 4px;background:linear-gradient(135deg,var(--brand),var(--brand-2));border:2px solid #fff;box-shadow:0 6px 14px -4px rgba(11,11,18,.45)">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff" aria-hidden="true"><path d="${glyphs[name] ?? glyphs.House}"/></svg>
    </div>`,
  });

function Recenter({ center }) {
  const map = useMap();
  const latitude = center[0];
  const longitude = center[1];
  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom());
  }, [latitude, longitude, map]);
  return null;
}

export default function MapView({
  className = "",
  center = VICTORIA,
  pins = [],
  query = "",
  onQueryChange,
  onLocate,
}) {
  return (
    <div className={`relative ${className}`}>
      <MapContainer
        center={center}
        zoom={12}
        zoomControl={false}
        scrollWheelZoom={false}
        className="size-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter center={center} />
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            position={[pin.latitude, pin.longitude]}
            icon={pinIcon(categoryGlyph[pin.categoryId] ?? "House")}
          />
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] p-4 lg:p-6">
        <SearchBar
          placeholder="Search nearby listings..."
          value={query}
          onChange={onQueryChange}
          className="pointer-events-auto rounded-full shadow-lift lg:max-w-md"
        />
      </div>

      <button
        type="button"
        aria-label="Center on my location"
        onClick={onLocate}
        className="absolute bottom-4 right-4 z-[500] grid size-11 place-items-center rounded-full bg-surface text-brand shadow-lift transition-transform hover:scale-105 lg:bottom-6 lg:right-6"
      >
        <LocateFixed className="size-6" strokeWidth={2.5} />
      </button>
    </div>
  );
}
