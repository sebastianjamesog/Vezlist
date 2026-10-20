"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  MapPin,
  Search,
} from "lucide-react";
import ChoiceRow from "./ui/ChoiceRow";
import Modal from "./ui/Modal";
import {
  ALL_CANADA,
  areasFor,
  provinceById,
  provinces,
} from "../data/locations";

/** "3 areas", in whatever language is on. Two keys, split at one, no plural engine. */
function countLabel(n) {
  return `${n} ${n === 1 ? "area" : "areas"}`;
}

/** "Ontario · 3 areas" — the whole choice in the width of one button. */
function summarise(filters) {
  const { label, id } = provinceById(filters.province);
  if (id === ALL_CANADA) return "All Canada";
  const n = filters.cities.length;
  // Province names stay as the data spells them. They are proper nouns, and
  // translating a place list inside a dictionary forks it away from the table
  // the listings are actually filtered against.
  return n ? `${label} · ${countLabel(n)}` : label;
}

/** A province you can step into — the count says how much is behind it. */
function ProvinceRow({ province, current, onPick }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-canvas"
    >
      <span className="min-w-0 flex-1 text-[15px] font-medium text-ink">
        {province.label}
      </span>
      {current && (
        <Check className="size-4 shrink-0 text-brand" strokeWidth={3} />
      )}
      {province.areas.length > 0 && (
        <>
          <span className="shrink-0 text-[13px] tabular-nums text-muted">
            {countLabel(province.areas.length)}
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted"
            strokeWidth={2.4}
          />
        </>
      )}
    </button>
  );
}

/**
 * Province and its areas are two halves of one choice, asked one at a time:
 * pick a province, then tick the areas inside it. A single scrolling list of
 * both reads as one long undifferentiated pile, so this steps instead.
 *
 * Edits are held in a draft until Done — a location change re-runs the feed, so
 * committing on every tick would thrash the results behind the modal.
 *
 * All Canada is the default. Only a deliberate selection narrows the board.
 */
export default function LocationBar({
  filters,
  onPatch,
  className = "",
  variant = "row",
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("province");
  const [draft, setDraft] = useState(filters);
  const [areaQuery, setAreaQuery] = useState("");

  const province = provinceById(draft.province);
  const areas = areasFor(province.id);
  const needle = areaQuery.trim().toLowerCase();
  const shown = needle
    ? areas.filter((a) => a.toLowerCase().includes(needle))
    : areas;

  function openModal() {
    // Reopening always starts from what is currently applied, at step one.
    setDraft(filters);
    setStep("province");
    setAreaQuery("");
    setOpen(true);
  }

  function apply(next) {
    onPatch(next);
    setOpen(false);
  }

  function pickProvince(id) {
    // Switching province drops areas that no longer exist under it.
    const cities = id === draft.province ? draft.cities : [];
    setDraft((d) => ({ ...d, province: id, cities }));
    setAreaQuery("");

    // Nothing to narrow means there is no second step to show.
    if (!areasFor(id).length) apply({ province: id, cities: [] });
    else setStep("areas");
  }

  function toggleArea(area) {
    setDraft((d) => ({
      ...d,
      cities: d.cities.includes(area)
        ? d.cities.filter((a) => a !== area)
        : [...d.cities, area],
    }));
  }

  const onAreas = step === "areas";
  const picked = draft.cities.length;

  return (
    <div className={className}>
      {variant === "card" ? (
        /**
         * The launcher's version. It used to be a tall centred card with its
         * own heading and a pill underneath — three stacked lines that took the
         * same visual weight as the nine category tiles below it, on a screen
         * whose whole job is to make those tiles the loudest thing there is.
         *
         * So it is one row now: the icon says place, the small caption says
         * whose, the bold line says where, and the chevron says it opens. Same
         * information, a third of the height, and no longer competing.
         */
        <button
          type="button"
          onClick={openModal}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex h-[68px] w-full items-center gap-3 rounded-card bg-surface px-4 text-left shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift"
        >
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-soft"
          >
            <MapPin className="size-5 text-brand" strokeWidth={2.4} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
              Your location
            </span>
            <span className="mt-0.5 block truncate text-[17px] font-bold leading-tight text-ink">
              {summarise(filters)}
            </span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="size-5 shrink-0 text-muted"
            strokeWidth={2.4}
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={openModal}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex h-12 w-full items-center gap-3 rounded-card bg-surface px-4 text-left shadow-card transition-shadow hover:shadow-lift lg:h-[52px] lg:px-5"
        >
          <MapPin
            className="size-[18px] shrink-0 text-brand"
            strokeWidth={2.4}
          />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
            {summarise(filters)}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted"
            strokeWidth={2.4}
          />
        </button>
      )}

      <Modal
        open={open}
        title={onAreas ? province.label : "Location"}
        subtitle={
          onAreas
            ? "Tick the areas you want, or leave them all clear for the whole province."
            : "Step 1 of 2 — pick a province."
        }
        onClose={() => setOpen(false)}
        bodyClassName="min-h-0 overflow-y-auto p-2"
        footer={
          onAreas ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep("province")}
                className="flex flex-1 items-center justify-center gap-1 rounded-2xl border border-line py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-canvas"
              >
                <ChevronLeft className="size-4" strokeWidth={2.6} />
                Back
              </button>
              <button
                type="button"
                onClick={() =>
                  apply({ province: draft.province, cities: draft.cities })
                }
                className="brand-gradient flex-[1.4] rounded-2xl py-3 text-[15px] font-bold text-on-brand shadow-pop transition-transform active:scale-[0.98]"
              >
                {picked
                  ? `Done · ${countLabel(picked)}`
                  : `All of ${province.label}`}
              </button>
            </div>
          ) : null
        }
      >
        {onAreas ? (
          <>
            <label className="mx-1 mb-2 flex items-center gap-2.5 rounded-2xl border border-line px-3.5 py-2.5 transition-colors focus-within:border-brand">
              <Search
                className="size-4 shrink-0 text-muted"
                strokeWidth={2.4}
              />
              <input
                type="search"
                value={areaQuery}
                onChange={(e) => setAreaQuery(e.target.value)}
                placeholder={`Filter ${areas.length} areas…`}
                className="w-full bg-transparent text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted"
              />
            </label>

            {shown.map((a) => (
              <ChoiceRow
                key={a}
                type="checkbox"
                checked={draft.cities.includes(a)}
                onChange={() => toggleArea(a)}
              >
                {a}
              </ChoiceRow>
            ))}

            {shown.length === 0 && (
              <p className="px-3 py-4 text-[14px] text-muted">
                {`No area in ${province.label} matches “${areaQuery}”.`}
              </p>
            )}
          </>
        ) : (
          <>
            {/* The coverage, stated once, where the question is asked. The
                country detection can put a visitor abroad on All Canada and
                say nothing about why; this is where it says why. */}
            <p className="mx-1 mb-2 flex items-start gap-2.5 rounded-2xl bg-brand-soft px-3.5 py-3 text-[13px] font-medium leading-snug text-brand">
              <Info className="mt-px size-4 shrink-0" strokeWidth={2.4} />
              Areas cover Canada today. Other countries are coming.
            </p>

            {provinces.map((p) => (
              <ProvinceRow
                key={p.id}
                province={p}
                current={p.id === draft.province}
                onPick={() => pickProvince(p.id)}
              />
            ))}
          </>
        )}
      </Modal>
    </div>
  );
}
