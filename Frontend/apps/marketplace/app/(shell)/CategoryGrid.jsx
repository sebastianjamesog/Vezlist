"use client";

import Link from "next/link";
import Icon from "@vezlist/shared/components/ui/Icon.jsx";
import { homeCategories } from "@vezlist/shared/data/mock.js";
import { PERSONALS_URL } from "@vezlist/shared/lib/sites.js";
import { useCatalog } from "@vezlist/shared/context/CatalogContext.jsx";

/**
 * The nine doorways on the home screen. Everything here is a real link — a tile
 * carries you into the feed already narrowed to that category, and Personals
 * carries you off this site entirely, so it must survive a middle-click.
 */
export default function CategoryGrid() {
  const { categories } = useCatalog();
  const byId = new Map(categories.map((category) => [category.id, category]));

  return (
    <nav aria-label="Categories" className="grid grid-cols-3 gap-3">
      {homeCategories.map((id) => {
        const personals = id === "personals";
        const cat = personals
          ? { label: "Personals", icon: "VenusAndMars" }
          : byId.get(id) ?? { label: id, icon: "Tag" };
        const Root = personals ? "a" : Link;

        return (
          <Root
            key={id}
            href={personals ? PERSONALS_URL : `/browse?cat=${id}`}
            className="group flex flex-col items-center justify-center gap-2 rounded-card bg-surface px-2 py-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.98]"
          >
            <Icon
              name={cat.icon}
              // Personals is the one tile that leaves; it wears its own site's
              // colour so it reads as a different place, not another filter.
              className={`size-7 ${personals ? "text-rose-600" : "text-brand"}`}
              strokeWidth={2}
            />
            <span
              className={`line-clamp-2 text-center text-[13px] font-semibold leading-tight ${
                personals ? "text-rose-600" : "text-ink"
              }`}
            >
              {cat.label}
            </span>
          </Root>
        );
      })}
    </nav>
  );
}
