"use client";
import { useState } from "react";
import useLocationCatalog from "../../hooks/useLocationCatalog.js";
import { locationNodes } from "../../lib/locationCatalog.js";
import { LocationCatalogStatus } from "../LocationHierarchy.jsx";
import { FIELD } from "./Field";

export default function LocationHierarchyPicker({ draft, onPatch, onSelect }) {
  const [open, setOpen] = useState(false);
  const { locations, status, retry } = useLocationCatalog({ enabled: open });
  const provinces = locations?.provinces ?? [];
  const province = provinces.find((row) => row.id === draft.provinceId);
  const current = locationNodes(locations).find(
    (row) => row.id === draft.locationId,
  );
  const areaId =
    current?.areaId ||
    draft.areaId ||
    (draft.locationType !== "NEIGHBOURHOOD" ? draft.locationId : "");
  const areas = province?.areas ?? [];
  const area = areas.find((row) => row.id === areaId);
  const neighbourhoods = area?.neighbourhoods ?? [];
  const childId =
    (current?.type ?? draft.locationType) === "NEIGHBOURHOOD"
      ? draft.locationId
      : "";
  const selectArea = (id) => {
    const row = locationNodes(locations).find((node) => node.id === id);
    if (row) onSelect(row);
    else
      onPatch({
        location: "",
        locationId: "",
        areaId: "",
        areaLabel: "",
        locationType: "",
      });
  };
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="text-[13px] font-semibold text-brand underline"
      >
        Choose by province, region and neighbourhood
      </button>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl border border-line p-3">
          <LocationCatalogStatus status={status} retry={retry} />
          <label className="block text-sm font-semibold">
            Province
            <select
              className={`${FIELD} mt-1`}
              value={draft.provinceId ?? ""}
              disabled={status !== "success"}
              onChange={(event) => {
                const next = provinces.find(
                  (row) => row.id === event.target.value,
                );
                onPatch({
                  provinceId: next?.id ?? "",
                  provinceLabel: next?.label ?? "",
                  location: "",
                  locationId: "",
                  areaId: "",
                  areaLabel: "",
                  locationType: "",
                });
              }}
            >
              <option value="">Select province</option>
              {draft.provinceId && !province && (
                <option value={draft.provinceId}>
                  {draft.provinceLabel || draft.provinceId} (saved)
                </option>
              )}
              {provinces.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          {draft.provinceId && (
            <label className="block text-sm font-semibold">
              Region / city
              <select
                className={`${FIELD} mt-1`}
                value={areaId ?? ""}
                disabled={status !== "success"}
                onChange={(event) => selectArea(event.target.value)}
              >
                <option value="">Select region or city</option>
                {areaId && !area && (
                  <option value={areaId}>
                    {draft.areaLabel || draft.location || areaId} (saved)
                  </option>
                )}
                {areas.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {areaId && (neighbourhoods.length > 0 || childId) && (
            <label className="block text-sm font-semibold">
              Neighbourhood (optional)
              <select
                className={`${FIELD} mt-1`}
                value={childId ?? ""}
                disabled={status !== "success"}
                onChange={(event) => selectArea(event.target.value || areaId)}
              >
                <option value="">Whole region / city</option>
                {childId &&
                  !neighbourhoods.some((row) => row.id === childId) && (
                    <option value={childId}>{draft.location} (saved)</option>
                  )}
                {neighbourhoods.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
