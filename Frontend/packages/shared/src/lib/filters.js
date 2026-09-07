import { provinceById } from "../data/locations.js";

const WINDOWS = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 };

export const DEFAULT_FILTERS = {
  sort: "newest",
  categories: [],
  province: "all",
  cities: [],
  minPrice: "",
  maxPrice: "",
  verifiedOnly: false,
  postedWithin: "any",
};

/** How many filter groups the user has actually narrowed (sort is not a filter). */
export function activeFilterCount(f) {
  return (
    (f.categories.length ? 1 : 0) +
    // Province and areas are one choice to the user, so they count once.
    (f.province !== "all" || f.cities.length ? 1 : 0) +
    (f.minPrice !== "" || f.maxPrice !== "" ? 1 : 0) +
    (f.verifiedOnly ? 1 : 0) +
    (f.postedWithin !== "any" ? 1 : 0)
  );
}

/** Chips shown above the feed; `clear` returns the filter patch that removes it. */
export function activeFilterChips(f) {
  const chips = [];
  for (const c of f.categories) {
    chips.push({
      key: `cat:${c}`,
      label: c,
      clear: { categories: f.categories.filter((x) => x !== c) },
    });
  }
  if (f.province !== "all") {
    chips.push({
      key: `prov:${f.province}`,
      label: provinceById(f.province).label,
      // Dropping the province drops the areas inside it too.
      clear: { province: "all", cities: [] },
    });
  }
  for (const c of f.cities) {
    chips.push({
      key: `city:${c}`,
      label: c,
      clear: { cities: f.cities.filter((x) => x !== c) },
    });
  }
  if (f.minPrice !== "" || f.maxPrice !== "") {
    const min = f.minPrice === "" ? "0" : f.minPrice;
    const max = f.maxPrice === "" ? "any" : f.maxPrice;
    chips.push({
      key: "price",
      label: `$${min} – ${max === "any" ? "any" : `$${max}`}`,
      clear: { minPrice: "", maxPrice: "" },
    });
  }
  if (f.verifiedOnly)
    chips.push({
      key: "verified",
      label: "Verified only",
      clear: { verifiedOnly: false },
    });
  if (f.postedWithin !== "any") {
    const labels = {
      "24h": "Last 24 hours",
      "7d": "Last 7 days",
      "30d": "Last 30 days",
    };
    chips.push({
      key: "posted",
      label: labels[f.postedWithin],
      clear: { postedWithin: "any" },
    });
  }
  return chips;
}

/**
 * Filter then sort. Price bounds are inclusive; a listing with price 0
 * (jobs, personals) is treated as "no price" and only excluded when the user
 * sets a minimum above 0.
 */
export function applyFilters(listings, filters, query = "") {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const q = query.trim().toLowerCase();
  const min = f.minPrice === "" ? null : Number(f.minPrice);
  const max = f.maxPrice === "" ? null : Number(f.maxPrice);
  const window = WINDOWS[f.postedWithin] ?? null;

  const out = listings.filter((l) => {
    if (
      q &&
      !`${l.title} ${l.business} ${l.category}`.toLowerCase().includes(q)
    )
      return false;
    if (f.categories.length && !f.categories.includes(l.category)) return false;
    if (f.province !== "all" && l.province !== provinceById(f.province).label)
      return false;
    if (f.cities.length && !f.cities.includes(l.location)) return false;
    if (min !== null && !Number.isNaN(min) && l.price < min) return false;
    if (max !== null && !Number.isNaN(max) && l.price > max) return false;
    if (f.verifiedOnly && !l.verified) return false;
    if (window !== null && l.postedMsAgo > window) return false;
    return true;
  });

  const sorters = {
    newest: (a, b) => a.postedMsAgo - b.postedMsAgo,
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    nearest: (a, b) => a.distanceKm - b.distanceKm,
  };
  return out.sort(sorters[f.sort] ?? sorters.newest);
}
