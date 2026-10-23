import { provinceById } from "../data/locations.js";

let currentCatalog = null;
export function setLocationCatalog(catalog) {
  currentCatalog = catalog;
}
export function locationCatalog() {
  return currentCatalog;
}
export function locationProvinces(catalog = currentCatalog) {
  return catalog?.provinces ?? [];
}
export function locationNodes(catalog = currentCatalog, provinceId = "all") {
  return locationProvinces(catalog)
    .filter((province) => provinceId === "all" || province.id === provinceId)
    .flatMap((province) =>
      (province.areas ?? []).flatMap((area) => {
        const parent = {
          ...area,
          type: "AREA",
          areaId: area.id,
          areaLabel: area.label,
          provinceId: province.id,
          provinceLabel: province.label,
        };
        return [
          parent,
          ...(area.neighbourhoods ?? []).map((child) => ({
            ...child,
            type: "NEIGHBOURHOOD",
            areaId: area.id,
            areaLabel: area.label,
            provinceId: province.id,
            provinceLabel: province.label,
          })),
        ];
      }),
    );
}
export function provinceLabel(id, catalog = currentCatalog) {
  if (id === "all") return "All Canada";
  const province = locationProvinces(catalog).find((row) => row.id === id);
  // Display old bookmarks while loading; these names are never selection options.
  const legacy = provinceById(id);
  return province?.label ?? (legacy.id === id ? legacy.label : id);
}
export function locationLabel(value, catalog = currentCatalog) {
  const row = locationNodes(catalog).find((node) => node.id === value);
  return row
    ? row.type === "NEIGHBOURHOOD"
      ? `${row.label}, ${row.areaLabel}`
      : row.label
    : value;
}
export function locationAncestry(row) {
  return [
    row?.type === "NEIGHBOURHOOD" ? row.areaLabel : null,
    row?.provinceLabel,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");
}
export function resolveLocationIds(catalog, filters) {
  const nodes = locationNodes(catalog, filters.province ?? "all");
  return [
    ...new Set(
      (filters.cities ?? []).flatMap((value) => {
        const byId = nodes.find((node) => node.id === value);
        if (byId) return [byId.id];
        const legacy = nodes.filter((node) => node.label === value);
        // Never silently broaden a saved filter if its node was removed or the
        // catalog is unavailable. The unmatched value yields no results server-side.
        return legacy.length ? legacy.map((node) => node.id) : [value];
      }),
    ),
  ];
}
export function selectedLocationIds(catalog, filters) {
  return new Set(resolveLocationIds(catalog, filters));
}
export function toggleLocation(catalog, filters, node) {
  const ids = selectedLocationIds(catalog, filters);
  if (ids.has(node.id)) ids.delete(node.id);
  else {
    ids.add(node.id);
    if (node.type === "NEIGHBOURHOOD") ids.delete(node.areaId);
    else for (const child of node.neighbourhoods ?? []) ids.delete(child.id);
  }
  return { ...filters, cities: [...ids] };
}
