export function normalizeCatalog(categories, locations, fallback) {
  if (!Array.isArray(categories) || categories.length === 0) return fallback;

  const apiProvinces = Array.isArray(locations?.provinces)
    ? locations.provinces.map((province) => ({
        id: province.id,
        label: province.label,
        areas: Array.isArray(province.areas)
          ? province.areas.map((area) => area.label)
          : [],
      }))
    : [];
  const apiPopularAreas = Array.isArray(locations?.popularAreas)
    ? locations.popularAreas.map((area) => area.label)
    : [];

  return {
    categories,
    provinces:
      apiProvinces.length > 0
        ? [{ id: "all", label: "All Canada", areas: [] }, ...apiProvinces]
        : fallback.provinces,
    popularAreas:
      apiPopularAreas.length > 0 ? apiPopularAreas : fallback.popularAreas,
    source: "api",
  };
}
