"use client";

import { useState } from "react";
import Modal from "./ui/Modal";
import SegmentedControl from "./ui/SegmentedControl";
import { ethnicities } from "../data/mock";
import { getCategories } from "../lib/taxonomy";

const TABS = [
  { value: "category", label: "Category", key: "categories" },
  { value: "ethnicity", label: "Ethnicity", key: "ethnicities" },
];

const OPTIONS = {
  ethnicities,
};

/**
 * The two questions the personals board is actually searched by: what a post is
 * for, and who is posting. They have a modal of their own rather than two more
 * groups behind the filter icon — those are the settings you change once, these
 * are the ones you change while you browse.
 *
 * Values are pills rather than the filter sheet's rows: eight short labels read
 * as a set you scan at once, where a column of rows reads as a list you work
 * through. Nothing applies until the footer says so, so a half-made choice
 * never re-cuts the board underneath you.
 */
export default function PersonalsPicker({
  open,
  initialTab = "category",
  filters,
  listings,
  query,
  onClose,
  onApply,
}) {
  const [draft, setDraft] = useState(filters);
  const [tab, setTab] = useState(initialTab);

  // Reopening starts from what is currently applied, on the tab it was opened
  // for — the two buttons that open this both name a side of it. Adjusted
  // during render rather than in an effect (the same pattern StatusViewer
  // uses to reset its own index on a new story): an effect would still commit
  // one frame with the previous draft/tab before the sync caught up, and
  // calling setState synchronously from an effect just to avoid that flash is
  // the cascading-render pattern the linter is warning about.
  const [prev, setPrev] = useState({ open, filters, initialTab });
  if (
    prev.open !== open ||
    prev.filters !== filters ||
    prev.initialTab !== initialTab
  ) {
    if (open) {
      if (!prev.open || filters !== prev.filters) setDraft(filters);
      if (!prev.open || initialTab !== prev.initialTab) setTab(initialTab);
    }
    setPrev({ open, filters, initialTab });
  }

  const options = {
    ...OPTIONS,
    categories: getCategories().map((category) => category.label),
  };
  const active = TABS.find((t) => t.value === tab) ?? TABS[0];
  const picked = draft[active.key];
  const chosen = TABS.reduce((n, t) => n + draft[t.key].length, 0);

  const toggle = (value) =>
    setDraft((d) => ({
      ...d,
      [active.key]: d[active.key].includes(value)
        ? d[active.key].filter((v) => v !== value)
        : [...d[active.key], value],
    }));

  return (
    <Modal
      open={open}
      title="Category & ethnicity"
      subtitle="What a post is for, and who is posting."
      onClose={onClose}
      size="max-w-lg"
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!chosen}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                categories: [],
                personalsCategories: [],
                ethnicities: [],
              }))
            }
            className="flex-1 rounded-2xl border border-line py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-canvas disabled:opacity-40"
          >
            Clear{chosen ? ` (${chosen})` : ""}
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            className="brand-gradient flex-[1.4] rounded-2xl py-3 text-[15px] font-bold text-on-brand shadow-pop transition-transform active:scale-[0.98]"
          >
            Apply filters
          </button>
        </div>
      }
    >
      <SegmentedControl
        label="Category or ethnicity"
        options={TABS.map((t) => ({
          value: t.value,
          label: draft[t.key].length
            ? `${t.label} · ${draft[t.key].length}`
            : t.label,
        }))}
        value={tab}
        onChange={setTab}
      />

      <div className="mt-5 flex flex-wrap gap-2">
        {options[active.key].map((option) => {
          const on = picked.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(option)}
              className={`rounded-full border px-4 py-2.5 text-[14px] font-semibold transition-all active:scale-[0.97] ${
                on
                  ? "border-transparent bg-brand text-on-brand shadow-pop"
                  : "border-line bg-surface text-ink hover:border-ink/25"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-[13px] leading-relaxed text-muted">
        Picking more than one widens the board — a post matching any of them
        stays.
      </p>
    </Modal>
  );
}
