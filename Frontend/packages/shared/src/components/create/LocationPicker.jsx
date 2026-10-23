"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { searchLocations } from "../../lib/api/catalog.js";
import LocationHierarchyPicker from "./LocationHierarchyPicker.jsx";
import { locationAncestry } from "../../lib/locationCatalog.js";
import { FIELD, border } from "./Field";

function useLocationResults(query, enabled = true, debounce = false) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({
    query,
    status: "loading",
    locations: [],
  });

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setResult({ query, status: "loading", locations: [] });
    const request = () => {
      searchLocations(query, query ? 20 : 50).then(
        (locations) => {
          if (current) setResult({ query, status: "success", locations });
        },
        () => {
          if (current) setResult({ query, status: "error", locations: [] });
        },
      );
    };
    const timer = debounce ? setTimeout(request, 250) : null;
    if (!debounce) request();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, enabled, debounce, attempt]);

  return {
    ...(result.query === query ? result : { status: "loading", locations: [] }),
    retry: () => setAttempt((value) => value + 1),
  };
}

const CHIP =
  "inline-flex max-w-full shrink-0 items-center rounded-full border px-3 py-1.5 text-[13px] font-semibold leading-5";

function LocationChips({ locations, selectedId, onSelect }) {
  const measureRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(0);

  useLayoutEffect(() => {
    const element = measureRef.current;
    if (!element) return;
    const measure = () => {
      if (element.getBoundingClientRect().width === 0) return;
      const rows = [];
      let count = 0;
      for (const chip of element.children) {
        const top = chip.offsetTop;
        if (!rows.some((row) => Math.abs(row - top) < 1)) rows.push(top);
        if (rows.length > 2) break;
        count += 1;
      }
      setVisibleCount(count);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);
    // Font swaps can change chip widths without changing the parent's width.
    let mounted = true;
    document.fonts?.ready.then(() => {
      if (mounted) measure();
    });
    window.addEventListener("resize", measure);
    return () => {
      mounted = false;
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [locations]);

  return (
    <div className="relative mt-2" data-location-suggestions>
      {/* Measure noninteractive spans: clipped buttons must never stay in the tab order. */}
      <div
        aria-hidden="true"
        className="invisible pointer-events-none absolute inset-x-0 top-0 h-0 overflow-hidden"
      >
        <div
          ref={measureRef}
          data-location-measure
          className="flex flex-wrap gap-2"
        >
          {locations.map((location) => (
            <span key={location.id} className={CHIP}>
              <span className="truncate">{location.label}</span>
            </span>
          ))}
        </div>
      </div>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Suggested locations"
      >
        {locations.slice(0, visibleCount).map((location) => (
          <button
            key={location.id}
            type="button"
            aria-pressed={selectedId === location.id}
            title={`${location.label}, ${locationAncestry(location)}`}
            onClick={() => onSelect(location)}
            className={`${CHIP} transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              selectedId === location.id
                ? "border-brand bg-brand text-on-brand"
                : "border-line text-ink hover:bg-canvas"
            }`}
          >
            <span className="truncate">{location.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RequestStatus({ result, searching }) {
  if (result.status === "loading") {
    return (
      <p role="status" className="mt-2 text-[13px] text-muted">
        {searching ? "Searching locations..." : "Loading locations..."}
      </p>
    );
  }
  if (result.status === "error") {
    return (
      <div
        role="alert"
        className="mt-2 flex items-center gap-2 text-[13px] text-red-600"
      >
        <span>Could not load locations.</span>
        <button
          type="button"
          onClick={result.retry}
          className="rounded font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Retry
        </button>
      </div>
    );
  }
  if (!result.locations.length) {
    return (
      <p role="status" className="mt-2 text-[13px] text-muted">
        {searching
          ? "No locations found. Try another city, area or province."
          : "No locations are available yet."}
      </p>
    );
  }
  return null;
}

export default function LocationPicker({ draft, error, onPatch }) {
  const id = useId();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const query = draft.locationId ? "" : (draft.location ?? "").trim();
  const defaults = useLocationResults("");
  const search = useLocationResults(query, Boolean(query), true);
  const searching = open && Boolean(query);
  const options = search.status === "success" ? search.locations : [];
  const listId = `${id}-results`;

  const select = (location) => {
    onPatch({
      location: location.label,
      locationId: location.id,
      provinceId: location.provinceId,
      provinceLabel: location.provinceLabel ?? "",
      areaId: location.areaId ?? location.id,
      areaLabel: location.areaLabel ?? location.label,
      locationType: location.type ?? "AREA",
    });
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape" && searching) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!query) return;
      event.preventDefault();
      setOpen(true);
      if (!options.length) return;
      setActiveIndex((index) =>
        event.key === "ArrowDown"
          ? (index + 1) % options.length
          : (index <= 0 ? options.length : index) - 1,
      );
    }
    if (event.key === "Enter" && searching) {
      // Don't submit the wizard while the user is choosing a search result.
      event.preventDefault();
      if (options[activeIndex]) select(options[activeIndex]);
    }
  };

  useEffect(() => {
    if (activeIndex < 0 || !searching) return;
    document
      .getElementById(`${listId}-${activeIndex}`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, listId, searching]);

  return (
    <div
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label
        htmlFor={id}
        className="mb-1.5 block text-[14px] font-bold text-ink"
      >
        Location
      </label>
      <input
        ref={inputRef}
        id={id}
        value={draft.location ?? ""}
        onChange={(event) => {
          onPatch({
            location: event.target.value,
            locationId: "",
            provinceId: "",
            provinceLabel: "",
            areaId: "",
            areaLabel: "",
            locationType: "",
          });
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={searching}
        aria-controls={searching && options.length ? listId : undefined}
        aria-activedescendant={
          searching && options[activeIndex]
            ? `${listId}-${activeIndex}`
            : undefined
        }
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        aria-invalid={Boolean(error)}
        autoComplete="off"
        maxLength={120}
        placeholder="Search city, area or province"
        className={`${FIELD} ${border(error)} focus-visible:ring-2 focus-visible:ring-brand/20`}
      />
      {searching ? (
        <>
          <RequestStatus result={search} searching />
          {options.length > 0 && (
            <>
              <p role="status" className="sr-only">
                {options.length} locations found.
              </p>
              <ul
                id={listId}
                role="listbox"
                aria-label="Matching locations"
                className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-line bg-surface p-1"
              >
                {options.map((location, index) => (
                  <li
                    key={location.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => select(location)}
                    className={`cursor-pointer rounded-lg px-3 py-2 text-[14px] ${index === activeIndex ? "bg-canvas text-brand" : "text-ink hover:bg-canvas"}`}
                  >
                    <span className="block font-semibold">
                      {location.label}
                    </span>{" "}
                    <span className="block text-[12px] text-muted">
                      {locationAncestry(location)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <>
          <RequestStatus result={defaults} />
          {defaults.status === "success" && defaults.locations.length > 0 && (
            <LocationChips
              locations={defaults.locations}
              selectedId={draft.locationId}
              onSelect={select}
            />
          )}
        </>
      )}
      <LocationHierarchyPicker
        draft={draft}
        onPatch={onPatch}
        onSelect={select}
      />
      {draft.locationId && draft.provinceLabel && (
        <p className="mt-2 text-[12px] text-muted">
          {[
            draft.provinceLabel,
            draft.areaLabel,
            draft.locationType === "NEIGHBOURHOOD" ? draft.location : null,
          ]
            .filter(Boolean)
            .join(" \u00b7 ")}
        </p>
      )}
      <p id={`${id}-hint`} className="mt-2 text-[12px] text-muted">
        Choose a suggested location or search for another city, area or
        province.
      </p>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 text-[13px] font-medium text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}
