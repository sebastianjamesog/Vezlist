"use client";

import { useState } from "react";
import ChoiceRow from "./ui/ChoiceRow";
import Modal from "./ui/Modal";
import {
  DEFAULT_FILTERS,
  applyFilters,
  reconcileSubcategory,
} from "../lib/filters";
import { getCategories, subsFor } from "../lib/taxonomy";
import { postedWithinOptions, sortOptions } from "../data/mock";
import { ALL_CANADA, areasFor, provinces } from "../data/locations";

/**
 * `site` marks a group only one board offers. The personals board's own two —
 * category and ethnicity — are deliberately absent: those are the cuts you
 * change while you browse, so they sit on the board itself in PersonalsPicker
 * rather than behind this icon with the settings you set once.
 */
const GROUPS = [
  { id: "sort", label: "Sort by" },
  { id: "category", label: "Category", site: "marketplace" },
  { id: "location", label: "Location" },
  { id: "more", label: "More filters" },
];

const offeredOn = (site) => (g) => !g.site || g.site === site;

export default function FilterSheet({
  open,
  filters,
  listings,
  query,
  initialGroup = "sort",
  personals = false,
  onClose,
  onApply,
}) {
  // One flag rather than one per group: every difference between the two
  // sheets is the same difference — which board is asking.
  const site = personals ? "personals" : "marketplace";
  const groups = GROUPS.filter(offeredOn(site));
  // Read fresh on every render — see `CategoryGrid.jsx` for why a module-
  // level constant would freeze this on whichever list was current at
  // import time rather than the real one `FeedContext` swaps in.
  const filterableCategories = getCategories().map((c) => c.label);
  const [draft, setDraft] = useState(filters);
  const [group, setGroup] = useState(initialGroup);

  // Reopening should always start from what is currently applied, on whichever
  // group the caller opened it for ("More" in the strip means Category).
  //
  // Reconciled on the way in, not trusted: the applied filters are written by
  // other surfaces too — a chip dismissed on Nearby, a shortcut rail patch —
  // and the sheet is the one screen that would *render* a stale sub-category
  // as a checked radio under a category that no longer owns it. Cheap and
  // idempotent, so it costs nothing when the state was already sound.
  //
  // Adjusted during render rather than in an effect (see PersonalsPicker for
  // the same pattern): an effect would still commit one frame with the old
  // draft/group before the sync caught up, and calling setState synchronously
  // from an effect just to avoid that flash is the cascading-render pattern
  // the linter is warning about.
  const [prev, setPrev] = useState({ open, filters, initialGroup, site });
  if (
    prev.open !== open ||
    prev.filters !== filters ||
    prev.initialGroup !== initialGroup ||
    prev.site !== site
  ) {
    if (open) {
      if (!prev.open || filters !== prev.filters) {
        setDraft(reconcileSubcategory(filters));
      }
      if (
        !prev.open ||
        initialGroup !== prev.initialGroup ||
        site !== prev.site
      ) {
        // A caller can ask for a group this sheet is not offering; start at
        // the top rather than on a group with no rail entry to get back from.
        setGroup(
          groups.some((g) => g.id === initialGroup) ? initialGroup : "sort",
        );
      }
    }
    setPrev({ open, filters, initialGroup, site });
  }

  const patch = (next) => setDraft((d) => ({ ...d, ...next }));
  const toggle = (key, value) =>
    patch({
      [key]: draft[key].includes(value)
        ? draft[key].filter((v) => v !== value)
        : [...draft[key], value],
    });

  /**
   * Categories get their own toggle rather than the generic one because they
   * are the only list whose contents change what a *different* field means:
   * check a second category and the chosen sub-category stops having a
   * referent. Reconciling inside the updater rather than in an effect after it
   * means the invalid pairing is never a state React could commit and paint —
   * an effect would leave one frame where Motorcycles sits checked under a
   * two-category selection.
   */
  const toggleCategory = (label) =>
    setDraft((d) =>
      reconcileSubcategory({
        ...d,
        categories: d.categories.includes(label)
          ? d.categories.filter((c) => c !== label)
          : [...d.categories, label],
      }),
    );

  /**
   * The sub-list only appears under exactly one checked category, because that
   * is the only arrangement in which it could be read: under none it narrows
   * nothing, and under two it would be asking which of two taxonomies you
   * meant. Everything below reads `onlyCategory` rather than re-deriving it,
   * so the rendered tree and `reconcileSubcategory` agree by construction.
   */
  const onlyCategory =
    draft.categories.length === 1 ? draft.categories[0] : null;
  const subs = onlyCategory ? subsFor(onlyCategory) : [];

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

        {/* Two levels, inline. The sub-list opens beneath the category it
            belongs to rather than in a second pane or a pushed screen: the
            whole reason to offer it here is that you can see the parent stays
            checked while you narrow, and a pane transition hides exactly that.
            Indented with padding on the group itself, not on a wrapper around
            each row, so the radios stay direct children of the radiogroup —
            an intervening div breaks the ownership assistive tech reads. */}
        {group === "category" &&
          filterableCategories.map((c) => {
            const showSubs = c === onlyCategory && subs.length > 0;
            return (
              <div key={c}>
                <ChoiceRow
                  type="checkbox"
                  checked={draft.categories.includes(c)}
                  onChange={() => toggleCategory(c)}
                >
                  {c}
                </ChoiceRow>

                {showSubs && (
                  <div
                    role="radiogroup"
                    aria-label={`Narrow ${c}`}
                    className="mb-1 ml-6 border-l border-line pl-2"
                  >
                    {/* The way back to "any". A radio group whose only options
                        narrow is a trap — once you have picked Motorcycles
                        there would be no control that undoes it short of
                        unchecking Vehicles and losing the category too. Named
                        after its parent rather than a bare "All" so it still
                        says what it is all of when read on its own. */}
                    <ChoiceRow
                      type="radio"
                      checked={!draft.subcategory}
                      onChange={() => patch({ subcategory: null })}
                    >
                      All of {c}
                    </ChoiceRow>
                    {subs.map((s) => (
                      <ChoiceRow
                        key={s}
                        type="radio"
                        checked={draft.subcategory === s}
                        onChange={() => patch({ subcategory: s })}
                      >
                        {s}
                      </ChoiceRow>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

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
                  {provinces.find((p) => p.id === draft.province).label}
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
            {/* Personals only, next to the verified switch because the two are
                the same kind of control — a claim the poster makes that the
                reader can insist on — and different in the one way that
                matters here: verification is a fact about an account and
                availability is a fact about a person's next hour. The tile on
                the personals home screen sets the same filter; this is where
                it is turned off again by hand, which is the whole reason a
                shortcut is allowed to set a filter at all.

                Absent rather than disabled on the marketplace, for the reason
                `applyFilters` spells out: those rows carry no availability
                claim, so the switch would narrow nothing and the honest
                rendering of a control that does nothing is no control. */}
            {personals && (
              <ChoiceRow
                type="checkbox"
                checked={draft.availableOnly}
                onChange={() => patch({ availableOnly: !draft.availableOnly })}
              >
                Available now
              </ChoiceRow>
            )}

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
