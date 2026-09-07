"use client";

import Icon from "./ui/Icon";
import { PERSONALS_URL } from "../lib/sites";
import { useCatalog } from "../context/CatalogContext";

function Tile({ icon, label, active, onClick, href }) {
  // An href tile leaves for the other site, so it has to be a real link.
  const Root = href ? "a" : "button";

  return (
    <Root
      href={href}
      onClick={onClick}
      aria-pressed={href ? undefined : active}
      className="group flex w-[62px] shrink-0 flex-col items-center gap-1.5 lg:w-auto lg:flex-row lg:gap-2.5"
    >
      <span
        className={`grid size-12 place-items-center rounded-2xl transition-all duration-200 lg:size-11 ${
          active
            ? "brand-gradient text-on-brand shadow-pop"
            : "bg-surface text-ink shadow-card group-hover:-translate-y-0.5 group-hover:shadow-lift"
        }`}
      >
        <Icon name={icon} className="size-6 lg:size-5" strokeWidth={2} />
      </span>
      <span
        className={`w-full truncate text-center text-[11px] font-semibold lg:text-[14px] ${
          active ? "text-brand" : "text-muted lg:text-ink"
        }`}
      >
        {label}
      </span>
    </Root>
  );
}

/**
 * Tinted icon tiles. Scrolls on the phone, wraps into a row on desktop; the
 * active one flips to the brand gradient so the choice is unmissable.
 *
 * Only the primary categories get a tile — the other thirteen live behind
 * "More", which hands off to the filter sheet's Category group. When one of
 * those is picked, the More tile wears its name so the choice stays visible.
 */
export default function CategoryStrip({ value, onChange }) {
  const { categories } = useCatalog();
  const primary = categories.filter((category) => category.primary);
  const secondary = categories.find((c) => c.id === value && !c.primary);

  return (
    // "More" is pinned outside the scroller: it is the only way to reach the
    // other thirteen, so it must never be the tile that scrolls off the edge.
    <div className="-mx-4 flex items-start gap-2 px-4 py-1 lg:mx-0 lg:px-0">
      <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto lg:flex-none lg:flex-wrap">
        {/* Personals is a separate site, so its tile is a doorway out rather
            than a filter — first in the strip so it never scrolls off. */}
        <Tile icon="VenusAndMars" label="Personals" href={PERSONALS_URL} />

        {primary.map((cat) => (
          <Tile
            key={cat.id}
            icon={cat.icon}
            label={cat.label}
            active={cat.id === value}
            onClick={() => onChange(cat.id)}
          />
        ))}
      </div>
      <Tile
        icon={secondary?.icon ?? "Ellipsis"}
        label={secondary?.label ?? "More"}
        active={Boolean(secondary)}
        onClick={() => onChange("more")}
      />
    </div>
  );
}
