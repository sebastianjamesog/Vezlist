"use client";

import { useEffect, useState } from "react";
import ChoiceRow from "./ui/ChoiceRow";
import Modal from "./ui/Modal";
import { DEFAULT_FILTERS, applyFilters } from "../lib/filters";
import {
  postedWithinOptions,
  priceBuckets,
  sortOptions,
} from "../data/mock";
import { ALL_CANADA } from "../data/locations";
import { useCatalog } from "../context/CatalogContext";

const GROUPS = [
  { id: "sort", label: "Sort by" },
  { id: "category", label: "Category" },
  { id: "price", label: "Price" },
  { id: "location", label: "Location" },
  { id: "more", label: "More filters" },
];

const PRICE_FIELD =
  "w-full rounded-2xl border border-line bg-surface px-3.5 py-3 text-[15px] font-medium text-ink outline-none transition-colors focus:border-brand";

export default function FilterSheet({
  open,
  filters,
  listings,
  query,
  initialGroup = "sort",
  hideCategory = false,
  onClose,
  onApply,
}) {
  const { categories, provinces } = useCatalog();
  const filterableCategories = categories.map((category) => category.label);
  const areasFor = (provinceId) =>
    provinces.find((province) => province.id === provinceId)?.areas ?? [];
  // On the personals board the category is the route, so offering it here
  // would hand back a way out that the board deliberately withholds.
  const groups = hideCategory
    ? GROUPS.filter((g) => g.id !== "category")
    : GROUPS;
  const [draft, setDraft] = useState(filters);
  const [group, setGroup] = useState(initialGroup);

  // Reopening should always start from what is currently applied, on whichever
  // group the caller opened it for ("More" in the strip means Category).
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  useEffect(() => {
    // A caller can ask for a group this sheet is not offering; start at the top
    // rather than on a group with no rail entry to get back from.
    if (!open) return;
    setGroup(
      initialGroup === "category" && hideCategory ? "sort" : initialGroup,
    );
  }, [open, initialGroup, hideCategory]);

  const patch = (next) => setDraft((d) => ({ ...d, ...next }));
  const toggle = (key, value) =>
    patch({
      [key]: draft[key].includes(value)
        ? draft[key].filter((v) => v !== value)
        : [...draft[key], value],
    });

  const resultCount = applyFilters(listings, draft, query).length;

  return (
    // The body height is pinned, not just floored: with only a minimum the
    // sheet resizes as you move between a four-row group and a twenty-row one.
    <Modal
      open={open}
      title="Filters"
      onClose={onClose}
      size="max-w-2xl"
      bodyClassName="flex max-h-[60vh] min-h-[60vh] p-0 lg:max-h-[420px] lg:min-h-[420px]"
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_FILTERS)}
            className="flex-1 rounded-2xl border border-line py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-canvas"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            className="brand-gradient flex-[1.4] rounded-2xl py-3 text-[15px] font-bold text-on-brand shadow-pop transition-transform active:scale-[0.98]"
          >
            Show {resultCount} {resultCount === 1 ? "ad" : "ads"}
          </button>
        </div>
      }
    >
      {/* Group rail — the Flipkart/Amazon two-pane pattern. It scrolls on its
          own so the group you are in never scrolls out of reach. */}
      <nav className="w-[38%] shrink-0 overflow-y-auto border-r border-line bg-canvas lg:w-[220px]">
        {groups.map((g) => {
          const active = g.id === group;
          return (
            <button
              key={g.id}
              type="button"
              aria-current={active}
              onClick={() => setGroup(g.id)}
              className={`relative block w-full py-4 pl-5 pr-3 text-left text-[14px] font-semibold transition-colors ${
                active ? "bg-surface text-brand" : "text-muted hover:text-ink"
              }`}
            >
              {active && (
                <span className="brand-gradient absolute inset-y-2 left-0 w-1 rounded-r-full" />
              )}
              {g.label}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto p-2">
        {group === "sort" && (
          <div role="radiogroup" aria-label="Sort by">
            {sortOptions.map((o) => (
              <ChoiceRow
                key={o.value}
                type="radio"
                checked={draft.sort === o.value}
                onChange={() => patch({ sort: o.value })}
              >
                {o.label}
              </ChoiceRow>
            ))}
          </div>
        )}

        {group === "category" &&
          filterableCategories.map((c) => (
            <ChoiceRow
              key={c}
              type="checkbox"
              checked={draft.categories.includes(c)}
              onChange={() => toggle("categories", c)}
            >
              {c}
            </ChoiceRow>
          ))}

        {group === "price" && (
          <div className="space-y-4 p-3">
            <div className="flex items-center gap-3">
              <label className="flex-1">
                <span className="mb-1.5 block text-[13px] font-semibold text-muted">
                  Min
                </span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={draft.minPrice}
                  onChange={(e) => patch({ minPrice: e.target.value })}
                  placeholder="0"
                  className={PRICE_FIELD}
                />
              </label>
              <span className="mt-6 text-muted">–</span>
              <label className="flex-1">
                <span className="mb-1.5 block text-[13px] font-semibold text-muted">
                  Max
                </span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={draft.maxPrice}
                  onChange={(e) => patch({ maxPrice: e.target.value })}
                  placeholder="Any"
                  className={PRICE_FIELD}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              {priceBuckets.map((b) => {
                const active =
                  String(draft.minPrice) === String(b.min) &&
                  String(draft.maxPrice) === String(b.max ?? "");
                return (
                  <button
                    key={b.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      patch({ minPrice: b.min, maxPrice: b.max ?? "" })
                    }
                    className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                      active
                        ? "brand-gradient border-transparent text-on-brand"
                        : "border-line text-ink hover:bg-canvas"
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {group === "location" && (
          <div>
            <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Province
            </p>
            <div role="radiogroup" aria-label="Province">
              {provinces.map((p) => (
                <ChoiceRow
                  key={p.id}
                  type="radio"
                  checked={draft.province === p.id}
                  // Switching province drops areas that no longer exist.
                  onChange={() => patch({ province: p.id, cities: [] })}
                >
                  {p.label}
                </ChoiceRow>
              ))}
            </div>

            {draft.province !== ALL_CANADA && (
              <>
                <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                  Cities in{" "}
                  {provinces.find((p) => p.id === draft.province)?.label ?? "Selected province"}
                </p>
                {areasFor(draft.province).map((a) => (
                  <ChoiceRow
                    key={a}
                    type="checkbox"
                    checked={draft.cities.includes(a)}
                    onChange={() => toggle("cities", a)}
                  >
                    {a}
                  </ChoiceRow>
                ))}
              </>
            )}
          </div>
        )}

        {group === "more" && (
          <div>
            <ChoiceRow
              type="checkbox"
              checked={draft.verifiedOnly}
              onChange={() => patch({ verifiedOnly: !draft.verifiedOnly })}
            >
              Verified ads only
            </ChoiceRow>

            <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Posted within
            </p>
            <div role="radiogroup" aria-label="Posted within">
              {postedWithinOptions.map((o) => (
                <ChoiceRow
                  key={o.value}
                  type="radio"
                  checked={draft.postedWithin === o.value}
                  onChange={() => patch({ postedWithin: o.value })}
                >
                  {o.label}
                </ChoiceRow>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
