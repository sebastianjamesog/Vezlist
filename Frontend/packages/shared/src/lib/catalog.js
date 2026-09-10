export function normalizeCatalog(categories, locations, fallback) {
  if (!Array.isArray(categories) || categories.length === 0) return fallback;

  const locationOptions = Array.isArray(locations?.provinces)
    ? locations.provinces.map((province) => ({
        id: province.id,
        label: province.label,
        areas: Array.isArray(province.areas)
          ? province.areas.map((area) => ({
              id: area.id,
              label: area.label,
              provinceId: province.id,
              provinceLabel: province.label,
            }))
          : [],
      }))
    : [];
  const popularAreaOptions = Array.isArray(locations?.popularAreas)
    ? locations.popularAreas
    : [];

  return {
    categories,
    provinces:
      locationOptions.length > 0
        ? [
            { id: "all", label: "All Canada", areas: [] },
            ...locationOptions.map((province) => ({
              ...province,
              areas: province.areas.map((area) => area.label),
            })),
          ]
        : fallback.provinces,
    popularAreas:
      popularAreaOptions.length > 0
        ? popularAreaOptions.map((area) => area.label)
        : fallback.popularAreas,
    locationOptions:
      locationOptions.length > 0 ? locationOptions : fallback.locationOptions,
    popularAreaOptions:
      popularAreaOptions.length > 0
        ? popularAreaOptions
        : fallback.popularAreaOptions,
    source: "api",
  };
}
