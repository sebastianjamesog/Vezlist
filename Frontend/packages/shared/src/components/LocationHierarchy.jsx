"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ChoiceRow from "./ui/ChoiceRow";
import {
  locationNodes,
  selectedLocationIds,
  toggleLocation,
} from "../lib/locationCatalog.js";

export function LocationCatalogStatus({ status, retry }) {
  if (status === "loading")
    return (
      <p role="status" className="px-3 py-2 text-sm text-muted">
        Loading locations...
      </p>
    );
  if (status === "error")
    return (
      <p role="alert" className="px-3 py-2 text-sm text-danger">
        Could not load locations.{" "}
        <button
          type="button"
          onClick={retry}
          className="font-semibold underline"
        >
          Retry locations
        </button>
      </p>
    );
  return null;
}

/** Region selections include all descendants; a neighbourhood replaces its parent selection. */
export default function LocationHierarchy({
  catalog,
  filters,
  onChange,
  query = "",
}) {
  const province = catalog?.provinces?.find(
    (row) => row.id === filters.province,
  );
  const selected = selectedLocationIds(catalog, filters);
  const needle = query.trim().toLowerCase();
  const nodes = locationNodes(catalog, filters.province);
  const [regionId, setRegionId] = useState(
    () =>
      nodes.find(
        (node) => node.type === "NEIGHBOURHOOD" && selected.has(node.id),
      )?.areaId ?? null,
  );
  const region = province?.areas?.find((area) => area.id === regionId);
  const regions = (province?.areas ?? []).filter(
    (area) =>
      !needle ||
      [
        area.label,
        ...(area.neighbourhoods ?? []).map((child) => child.label),
      ].some((label) => label.toLowerCase().includes(needle)),
  );
  if (region) {
    const children = region.neighbourhoods ?? [];
    const matching = children.filter(
      (child) =>
        !needle ||
        region.label.toLowerCase().includes(needle) ||
        child.label.toLowerCase().includes(needle),
    );
    return (
      <section aria-label="Neighbourhood">
        <button
          type="button"
          onClick={() => setRegionId(null)}
          className="flex min-h-11 items-center gap-1 px-3 text-sm font-semibold text-brand"
        >
          <ChevronLeft className="size-4 shrink-0" />
          Back to regions
        </button>
        <h3 className="px-3 pt-2 text-sm font-bold text-ink">
          3. Neighbourhood
        </h3>
        <p className="px-3 pb-2 text-sm text-muted">{region.label}</p>
        <ChoiceRow
          type="checkbox"
          checked={selected.has(region.id)}
          onChange={() =>
            onChange(
              toggleLocation(
                catalog,
                filters,
                nodes.find((node) => node.id === region.id),
              ),
            )
          }
        >
          All of {region.label}
        </ChoiceRow>
        {matching.map((child) => (
          <ChoiceRow
            key={child.id}
            type="checkbox"
            checked={selected.has(child.id)}
            onChange={() =>
              onChange(
                toggleLocation(
                  catalog,
                  filters,
                  nodes.find((node) => node.id === child.id),
                ),
              )
            }
          >
            {child.label}
          </ChoiceRow>
        ))}
        {!children.length && (
          <p className="px-3 py-3 text-sm text-muted">
            No neighbourhoods have been added for this region yet. You can
            search the whole region.
          </p>
        )}
        {children.length > 0 && !matching.length && (
          <p className="px-3 py-3 text-sm text-muted">
            No matching neighbourhoods.
          </p>
        )}
      </section>
    );
  }
  return (
    <div>
      <h3 className="px-3 pb-1 pt-2 text-sm font-bold text-ink">
        2. Region / city
      </h3>
      <p className="px-3 pb-2 text-sm text-muted">
        Choose a region to see its neighbourhoods.
      </p>
      {regions.map((area) => {
        const parent = nodes.find((row) => row.id === area.id);
        return (
          <section key={area.id} className="flex items-center">
            <div className="min-w-0 flex-1">
              <ChoiceRow
                type="checkbox"
                checked={selected.has(area.id)}
                onChange={() => {
                  onChange(toggleLocation(catalog, filters, parent));
                  if (!selected.has(area.id)) setRegionId(area.id);
                }}
              >
                {area.label}
              </ChoiceRow>
            </div>
            <button
              type="button"
              aria-label={`Choose neighbourhoods in ${area.label}`}
              onClick={() => setRegionId(area.id)}
              className="grid size-11 shrink-0 place-items-center rounded-xl text-brand hover:bg-canvas"
            >
              <ChevronRight className="size-5" />
            </button>
          </section>
        );
      })}
      {!regions.length && (
        <p className="px-3 py-4 text-sm text-muted">
          {needle
            ? "No matching regions or neighbourhoods."
            : "No regions are available in this province yet."}
        </p>
      )}
      <p className="px-3 pb-2 pt-4 text-sm font-bold text-muted">
        3. Neighbourhood
      </p>
      <p className="px-3 pb-3 text-sm text-muted">
        Select a region above to choose a neighbourhood.
      </p>
    </div>
  );
}
