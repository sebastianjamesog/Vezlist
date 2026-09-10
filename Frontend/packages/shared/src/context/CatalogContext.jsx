"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import {
  categories as marketplaceCategories,
  popularAreas as fallbackPopularAreas,
} from "../data/mock";
import { provinces as fallbackProvinces } from "../data/locations";
import { IS_PERSONALS } from "../lib/sites";
import { normalizeCatalog } from "../lib/catalog";

const personalsCategories = [
  { id: "personals", label: "Personals", icon: "Users", primary: true },
];

const fallbackLocationOptions = fallbackProvinces
  .filter((province) => province.id !== "all")
  .map((province) => ({
    id: province.id,
    label: province.label,
    areas: province.areas.map((label, index) => ({
      id: `${province.id}-${index + 1}`,
      label,
      provinceId: province.id,
      provinceLabel: province.label,
    })),
  }));
const fallbackPopularAreaOptions = fallbackLocationOptions
  .flatMap((province) => province.areas)
  .filter((area) => fallbackPopularAreas.includes(area.label));

function fallbackCatalog() {
  return {
    categories: IS_PERSONALS ? personalsCategories : marketplaceCategories,
    provinces: fallbackProvinces,
    popularAreas: fallbackPopularAreas,
    locationOptions: fallbackLocationOptions,
    popularAreaOptions: fallbackPopularAreaOptions,
    source: "fallback",
  };
}

const CatalogContext = createContext(fallbackCatalog());

export function CatalogProvider({ children }) {
  const [catalog, setCatalog] = useState(fallbackCatalog);

  useEffect(() => {
    let active = true;
    const site = IS_PERSONALS ? "PERSONALS" : "MARKETPLACE";

    Promise.all([api(`/categories?site=${site}`), api("/locations")])
      .then(([categories, locations]) => {
        if (!active) return;
        setCatalog(normalizeCatalog(categories, locations, fallbackCatalog()));
      })
      .catch(() => {
        // Reference data is bundled as a deliberate read-only fallback. The
        // app remains usable while the API is unavailable and retries on reload.
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => catalog, [catalog]);
  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog() {
  return useContext(CatalogContext);
}
