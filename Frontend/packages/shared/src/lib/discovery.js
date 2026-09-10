import { DEFAULT_FILTERS } from "./filters.js";

const API_SORT = {
  newest: "NEWEST",
  "price-asc": "PRICE_ASC",
  "price-desc": "PRICE_DESC",
  nearest: "NEAREST",
};

const API_POSTED_WITHIN = {
  any: "ANY",
  "24h": "HOURS_24",
  "7d": "DAYS_7",
  "30d": "DAYS_30",
};

const SORTS = new Set(Object.keys(API_SORT));
const WINDOWS = new Set(Object.keys(API_POSTED_WITHIN));

function values(params, key) {
  return params
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function categoryId(value, catalog) {
  return catalog.categories.find(
    (category) => category.id === value || category.label === value,
  )?.id;
}

function categoryLabel(value, catalog) {
  return catalog.categories.find((category) => category.id === value)?.label;
}

function areaOptions(catalog) {
  return (catalog.locationOptions ?? []).flatMap((province) => province.areas);
}

function areaId(value, catalog) {
  return areaOptions(catalog).find(
    (area) => area.id === value || area.label === value,
  )?.id;
}

function areaLabel(value, catalog) {
  return areaOptions(catalog).find((area) => area.id === value)?.label;
}

function nonNegative(value) {
  if (value == null || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? String(value) : "";
}

export function filtersFromSearchParams(
  params,
  catalog,
  defaultSort = "newest",
  allowNearest = false,
) {
  const requestedCategories = values(params, "category");
  const entryCategory = params.get("cat");
  if (!requestedCategories.length && entryCategory) {
    requestedCategories.push(entryCategory);
  }
  const categories = requestedCategories
    .map((id) => categoryLabel(id, catalog))
    .filter(Boolean);
  const areas = values(params, "area")
    .map((id) => areaLabel(id, catalog))
    .filter(Boolean);
  const requestedProvince = params.get("province");
  const province = catalog.provinces.some(
    (option) => option.id === requestedProvince,
  )
    ? requestedProvince
    : "all";
  const sort = params.get("sort");
  const postedWithin = params.get("posted");

  return {
    ...DEFAULT_FILTERS,
    sort:
      SORTS.has(sort) && (sort !== "nearest" || allowNearest)
        ? sort
        : defaultSort,
    categories: [...new Set(categories)],
    province,
    cities: [...new Set(areas)],
    minPrice: nonNegative(params.get("minPrice")),
    maxPrice: nonNegative(params.get("maxPrice")),
    verifiedOnly: params.get("verified") === "1",
    postedWithin: WINDOWS.has(postedWithin) ? postedWithin : "any",
  };
}

export function discoveryUrlParams(
  filters,
  query,
  catalog,
  { defaultSort = "newest", preserve = {} } = {},
) {
  const params = new URLSearchParams();
  if (query?.trim()) params.set("q", query.trim());
  if (filters.sort !== defaultSort) params.set("sort", filters.sort);
  for (const value of filters.categories) {
    const id = categoryId(value, catalog);
    if (id) params.append("category", id);
  }
  if (filters.province && filters.province !== "all") {
    params.set("province", filters.province);
  }
  for (const value of filters.cities) {
    const id = areaId(value, catalog);
    if (id) params.append("area", id);
  }
  if (filters.minPrice !== "") params.set("minPrice", filters.minPrice);
  if (filters.maxPrice !== "") params.set("maxPrice", filters.maxPrice);
  if (filters.verifiedOnly) params.set("verified", "1");
  if (filters.postedWithin !== "any") {
    params.set("posted", filters.postedWithin);
  }
  for (const [key, value] of Object.entries(preserve)) {
    if (value != null && value !== "") params.set(key, value);
  }
  return params;
}

export function discoveryApiPath({
  site,
  filters,
  query,
  catalog,
  coordinates,
  fixedCategoryIds = [],
  cursor,
  limit = 24,
  map = false,
}) {
  const params = new URLSearchParams({ site: site.toUpperCase() });
  if (query?.trim()) params.set("q", query.trim());

  const ids = fixedCategoryIds.length
    ? fixedCategoryIds
    : filters.categories
        .map((value) => categoryId(value, catalog))
        .filter(Boolean);
  for (const id of ids) params.append("category", id);
  if (filters.province && filters.province !== "all") {
    params.set("province", filters.province);
  }
  for (const value of filters.cities) {
    const id = areaId(value, catalog);
    if (id) params.append("area", id);
  }
  if (filters.minPrice !== "") params.set("minPrice", filters.minPrice);
  if (filters.maxPrice !== "") params.set("maxPrice", filters.maxPrice);
  if (filters.verifiedOnly) params.set("verifiedOnly", "true");
  params.set("postedWithin", API_POSTED_WITHIN[filters.postedWithin] ?? "ANY");
  if (!map) params.set("sort", API_SORT[filters.sort] ?? "NEWEST");

  if (coordinates) {
    params.set("latitude", coordinates.latitude);
    params.set("longitude", coordinates.longitude);
    params.set("radiusKm", coordinates.radiusKm);
  }
  params.set("limit", limit);
  if (cursor) params.set("cursor", cursor);
  return `/listings${map ? "/map" : ""}?${params}`;
}

export function discoveryListingToCard(listing, now = Date.now()) {
  const publishedAt = new Date(listing.publishedAt).getTime();
  return {
    id: listing.id,
    adId: listing.id,
    title: listing.title,
    business: listing.businessName,
    price: listing.price == null ? 0 : Number(listing.price),
    categoryId: listing.categoryId,
    category: listing.categoryLabel,
    provinceId: listing.provinceId,
    province: listing.provinceLabel,
    locationId: listing.locationId,
    location: listing.locationLabel,
    image: listing.imageUrl || "/icon.svg",
    photoCount: Number(listing.photoCount ?? 0),
    verified: Boolean(listing.verified),
    postedMsAgo: Number.isFinite(publishedAt)
      ? Math.max(0, now - publishedAt)
      : 0,
    distanceKm: listing.distanceKm == null ? null : Number(listing.distanceKm),
  };
}
