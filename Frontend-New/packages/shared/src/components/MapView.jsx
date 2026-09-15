"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { ChevronRight, LocateFixed, Minus, Plus, X } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { listings, personalsListings } from "../data/mock";
import { IS_PERSONALS } from "../lib/sites";
import { clusterPoints, pointsInView, scatterAround } from "./map/geo.js";
import { MARKER_CSS, clusterIcon, pinIcon } from "./map/icons.js";
import SearchBar from "./ui/SearchBar";
import MediaImage from "./media/MediaImage.jsx";

const VICTORIA = [48.4284, -123.3656];

/** Which board's ads this map plots. Same split the rest of the app makes. */
const FEED = IS_PERSONALS ? personalsListings : listings;

/**
 * The map is never the only route to a listing.
 *
 * Every pin here is also a row in the sheet below (`Nearby.jsx`), which is a
 * plain list of links — so a screen reader, a keyboard, a browser with the tile
 * request blocked, or anyone who simply cannot work a map still reaches every
 * ad. That is what lets the map be genuinely graphical instead of being
 * flattened into an accessible-but-useless picture of a list. The pins are
 * still focusable and named, but they are an enhancement, not the fallback.
 */
export default function MapView({ className = "", items, onTap }) {
  // `Nearby` hands down its filtered feed so the pins and the list below always
  // describe the same set of ads; on its own the map falls back to the whole
  // board rather than rendering empty.
  const feed = items ?? FEED;
  const points = useMemo(() => scatterAround(feed, VICTORIA), [feed]);

  // The Leaflet instance, lifted out of the container so the chrome around the
  // map (zoom buttons, locate, the selection card) can drive it. react-leaflet
  // hands the map itself to `ref`, which is why this is state and not a ref
  // object — the chrome has to re-render once the map exists.
  const [map, setMap] = useState(null);
  const [selected, setSelected] = useState(null);

  /**
   * Leaflet caches the container's size and only re-reads it when the *window*
   * resizes. `Nearby` grows this container by CSS when its list folds away,
   * which the window never hears about — so without this the map would keep
   * drawing at its old height, leaving an unpainted strip along the bottom and
   * every pin a few dozen pixels out. A `ResizeObserver` is the only thing
   * that sees a size change the window did not cause.
   *
   * `invalidateSize` fires Leaflet's own `resize`, which is what `PinLayer`
   * below is already listening to, so the pins re-cluster for the new viewport
   * as part of the same pass.
   */
  useEffect(() => {
    if (!map || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  /**
   * Scroll-wheel zoom, but only once the user has committed to the map.
   *
   * The flag started out `false` for a good reason: this map sits inside a page
   * that scrolls, and a map that swallows the wheel on hover is the classic way
   * to trap someone halfway down a screen. Leaving it off forever is the other
   * failure — a map you cannot zoom with the tool you already have your hand
   * on. The standard resolution is to arm it on a click or a keyboard focus and
   * disarm it when the pointer leaves, so scrolling *past* the map does nothing
   * and scrolling *in* it works.
   */
  useEffect(() => {
    if (!map) return undefined;

    const arm = () => map.scrollWheelZoom.enable();
    const disarm = () => map.scrollWheelZoom.disable();
    const container = map.getContainer();

    // A DOM listener on the container rather than Leaflet's own `click`,
    // because a click on a marker does not bubble to the map — Leaflet markers
    // ship with `bubblingMouseEvents: false` — and tapping a pin is the most
    // obvious way somebody signals that they are working with this map.
    container.addEventListener("click", arm);
    container.addEventListener("mouseleave", disarm);
    map.on("focus", arm);
    map.on("blur", disarm);

    return () => {
      container.removeEventListener("click", arm);
      container.removeEventListener("mouseleave", disarm);
      map.off("focus", arm);
      map.off("blur", disarm);
    };
  }, [map]);

  /**
   * Tell the screen around us that the map is what the reader is working with.
   *
   * `Nearby` uses this to fold its list away and hand the map the rest of the
   * height. It is a DOM listener on the container rather than Leaflet's own
   * `click`, for the same reason the wheel-zoom arming above is: markers ship
   * with `bubblingMouseEvents: false`, so a tap on a pin never reaches the
   * map's click event — and a tap on a pin is the clearest signal of all that
   * somebody wants more map than list.
   */
  useEffect(() => {
    if (!map || !onTap) return undefined;
    const container = map.getContainer();
    container.addEventListener("click", onTap);
    return () => container.removeEventListener("click", onTap);
  }, [map, onTap]);

  /** Tapping bare map dismisses the card; tapping a pin never reaches here. */
  useEffect(() => {
    if (!map) return undefined;
    const clear = () => setSelected(null);
    map.on("click", clear);
    return () => map.off("click", clear);
  }, [map]);

  const locate = () => {
    // The button used to be decoration. It has the map now, so it does the
    // thing it looks like it does — and quietly stays put if permission is
    // refused, because a map that has not moved is a perfectly readable answer.
    map?.locate({ setView: true, maxZoom: 14 });
  };

  return (
    <div className={`relative ${className}`}>
      {/* The marker rules travel with the markup that needs them, in
          `map/icons.js`, rather than in the shared `index.css`. */}
      <style>{MARKER_CSS}</style>

      <MapContainer
        ref={setMap}
        center={VICTORIA}
        zoom={12}
        // Leaflet's own zoom control is a pair of grey squares in the top-left
        // corner that belong to no design system; ours is below.
        zoomControl={false}
        // Off at mount, armed on interaction — see the effect above.
        scrollWheelZoom={false}
        // These are Leaflet's defaults, written out because "the map does not
        // move" was the previous behaviour and the next person to read this
        // should be able to see that moving it is now intended.
        dragging
        touchZoom
        doubleClickZoom
        keyboard
        className="size-full"
      >
        <TileLayer
          // A near-monochrome basemap: the pins are photographs, and a map that
          // is also full of colour turns them into noise. Positron is free and
          // needs no key. Both attributions are a licence condition of using
          // the data and the tiles — they are not ornament and do not come out.
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />

        <PinLayer
          points={points}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
        />
      </MapContainer>

      {/* The reference design puts a small "My Map" account chip up here beside
          the search field. It is not here: there is no saved-places feature and
          no per-user map behind it, so it would be a control that looks tappable
          and does nothing — which costs more trust than the corner it fills is
          worth. Worth adding the day it has somewhere to go. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] p-4 lg:p-6">
        <SearchBar
          placeholder="Search for a location..."
          className="pointer-events-auto rounded-full shadow-lift lg:max-w-md"
        />
      </div>

      {/* Zoom and locate, stacked. They lift out of the way when a card is
          showing rather than sitting on top of it — at 430px there is not room
          for both along the bottom edge. */}
      <div
        className={`absolute right-4 z-[500] flex flex-col gap-2 transition-[bottom] duration-200 lg:right-6 ${
          selected ? "bottom-[108px] lg:bottom-[124px]" : "bottom-4 lg:bottom-6"
        }`}
      >
        <div className="flex flex-col overflow-hidden rounded-2xl bg-surface shadow-lift">
          <button
            onClick={() => map?.zoomIn()}
            aria-label="Zoom in"
            className="grid size-11 place-items-center text-ink transition-colors hover:text-brand active:bg-brand-soft"
          >
            <Plus className="size-5" strokeWidth={2.6} />
          </button>
          <span className="mx-2 h-px bg-line" />
          <button
            onClick={() => map?.zoomOut()}
            aria-label="Zoom out"
            className="grid size-11 place-items-center text-ink transition-colors hover:text-brand active:bg-brand-soft"
          >
            <Minus className="size-5" strokeWidth={2.6} />
          </button>
        </div>

        <button
          onClick={locate}
          aria-label="Center on my location"
          className="grid size-11 place-items-center rounded-full bg-surface text-brand shadow-lift transition-transform hover:scale-105"
        >
          <LocateFixed className="size-6" strokeWidth={2.5} />
        </button>
      </div>

      {selected && (
        <SelectedCard item={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

/**
 * The markers.
 *
 * A child of `MapContainer` rather than part of `MapView` because `useMap` and
 * `useMapEvents` only exist inside it — and because clustering has to be redone
 * whenever the projection moves, which is a subscription, not a render.
 *
 * The photos inside each pin stay raw `<img>` tags (see `photo()` in
 * `map/icons.js`) rather than `MediaImage`/`next/image`: `L.divIcon` takes a
 * string of HTML that Leaflet parses and inserts into a pane it owns, never
 * a React tree, and `next/image` only works as a mounted React component —
 * it manages its own `<img>` through refs and effects that string
 * concatenation can't reach. There is no lazy loading to add here either;
 * Leaflet already builds a marker's HTML (photo included) only once that
 * marker is inside the viewport, via `pointsInView` above.
 */
function PinLayer({ points, selectedId, onSelect }) {
  const map = useMap();

  // Leaflet's view is not React state, so it gets a counter to stand in for it.
  // `zoomend` changes the pixel positions the clusterer buckets on, `moveend`
  // changes which pins are inside the viewport at all, and `resize` is the one
  // that matters on first paint: the container is briefly zero-height, and a
  // map with no size has no bounds and therefore no pins.
  const [view, setView] = useState(0);
  const bump = () => setView((n) => n + 1);
  useMapEvents({ zoomend: bump, moveend: bump, resize: bump });

  const clusters = useMemo(
    // `view` is not read in the body on purpose: it is the signal that the map
    // moved underneath us, and dropping it here would freeze the pins at
    // whatever the projection happened to be on first render.
    () => clusterPoints(pointsInView(points, map), map),
    // `view` is a deliberate re-run signal, not a value the callback reads;
    // see the comment above. Removing it would stop pins from re-clustering
    // on pan and zoom, since `map` is a stable ref and `points` does not
    // change.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [points, map, view],
  );

  return clusters.map((cluster) => {
    if (cluster.members.length === 1) {
      const point = cluster.members[0];
      const { title, distanceKm } = point.listing;

      return (
        <Marker
          // Keyed by the listing, not the grid cell, so panning does not remount
          // a pin that has not changed.
          key={point.id}
          position={[point.lat, point.lng]}
          icon={pinIcon(point, { selected: point.id === selectedId })}
          // A marker built from a div has no intrinsic name, and Leaflet is
          // focusable by default, so an unnamed one is a tab stop that
          // announces nothing. `title` is the option Leaflet copies onto every
          // icon element it builds — including the replacement it builds when
          // selecting a pin swaps the icon — so that is what carries the name;
          // `alt` is passed alongside it because Leaflet applies it to image
          // icons, and the two should not drift if this ever stops being a div.
          title={`${title}, ${distanceKm.toFixed(1)} km away`}
          alt={`${title}, ${distanceKm.toFixed(1)} km away`}
          eventHandlers={{ click: () => onSelect(point.listing) }}
        />
      );
    }

    const names = cluster.members
      .slice(0, 3)
      .map((m) => m.listing.title)
      .join(", ");

    return (
      <Marker
        key={cluster.key}
        position={[cluster.lat, cluster.lng]}
        icon={clusterIcon(cluster)}
        title={`${cluster.members.length} listings here: ${names}${
          cluster.members.length > 3 ? " and more" : ""
        }`}
        alt={`${cluster.members.length} listings here: ${names}${
          cluster.members.length > 3 ? " and more" : ""
        }`}
        eventHandlers={{
          click: () =>
            // Expanding a cluster means zooming to what is inside it. `maxZoom`
            // stops a pair of ads a few metres apart from throwing the map to
            // street level.
            map.fitBounds(
              cluster.members.map((m) => [m.lat, m.lng]),
              { padding: [64, 64], maxZoom: 17 },
            ),
        }}
      />
    );
  });
}

/**
 * The card a tapped pin opens.
 *
 * The alternative was to scroll the sheet below to the matching row. That loses
 * at 430px: the sheet starts at 54% of the screen and the map fills the rest, so
 * the selected row would land off-screen behind the map — the tap would look
 * like it did nothing — and scrolling the sheet programmatically fights whatever
 * the reader was already doing with it. A card over the map answers "what is
 * this pin" without moving anything the user put where it is.
 */
function SelectedCard({ item, onClose }) {
  return (
    <div className="absolute inset-x-4 bottom-4 z-[600] lg:inset-x-6 lg:bottom-6 lg:max-w-md">
      <div className="relative swap-in">
        <Link
          href={`/ad/${item.adId}`}
          className="group flex items-center gap-3 rounded-card bg-surface p-2.5 pr-10 shadow-lift"
        >
          <MediaImage
            src={item.image}
            alt=""
            width={56}
            height={56}
            className="size-14 shrink-0 rounded-2xl object-cover"
          />

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-bold text-ink transition-colors group-hover:text-brand">
              {item.title}
            </h3>
            <div className="mt-1 flex items-center gap-2">
              {item.price > 0 && (
                <span className="rounded-lg bg-brand-soft px-2 py-0.5 text-[13px] font-bold tabular-nums text-brand">
                  ${item.price.toLocaleString()}
                </span>
              )}
              <span className="truncate text-[12px] font-medium text-muted">
                {item.distanceKm.toFixed(1)} km away
              </span>
            </div>
          </div>

          <ChevronRight
            className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
            strokeWidth={2.4}
          />
        </Link>

        {/* A sibling of the link, not a child of it — a button inside an anchor
            is invalid and behaves differently in every browser. Tapping the map
            dismisses this too; the button is here for anyone who is not aiming
            a finger at a moving map. */}
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="absolute -right-1.5 -top-1.5 grid size-7 place-items-center rounded-full bg-ink text-white shadow-card transition-transform active:scale-90"
        >
          <X className="size-3.5" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
