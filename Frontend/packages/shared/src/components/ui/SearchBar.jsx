"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";

/**
 * Raised pill. No border — elevation separates it from the canvas instead.
 *
 * Plain by default: an `<input type="search">` with nothing wired to it,
 * which is what every existing caller still gets — the admin tables, `Faqs`,
 * `MapView`, and the personals board's own search row. It only grows into the
 * combobox described by WAI-ARIA APG's "Editable Combobox With List
 * Autocomplete" pattern when a caller opts in by passing `suggestions`: the
 * marketplace's `BrowseScreen` does, for its autocomplete, recent searches and
 * clear-history row; nothing else needs to. The two must never drift —
 * `role="combobox"` on a search box that owns no popup would tell a screen
 * reader there is one here when there is not — so the whole widget switches
 * on whether `suggestions` was even passed, not on whether it is currently
 * empty.
 *
 * `suggestions` is a flat list of `{ id, label, meta? }` rows — what to show
 * is the caller's call (matching categories, recent terms, a "Clear recent
 * searches" row are all just rows here), this component only owns the
 * keyboard and the popup around them.
 */
export default function SearchBar({
  placeholder = "Search...",
  label = "Search",
  value,
  onChange,
  className = "",
  suggestions,
  onSelectSuggestion,
  onSubmit,
}) {
  const assisted = suggestions !== undefined;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();

  const items = assisted ? suggestions : [];
  const optionId = (i) => `${listboxId}-opt-${i}`;

  function closePopup() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function choose(item) {
    onSelectSuggestion?.(item);
    closePopup();
  }

  function onKeyDown(e) {
    if (!assisted) return;

    if (e.key === "ArrowDown") {
      if (!items.length) return;
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && items[activeIndex]) {
        e.preventDefault();
        choose(items[activeIndex]);
      } else {
        closePopup();
        onSubmit?.(value);
      }
    } else if (e.key === "Escape") {
      if (open) {
        // The APG pattern: the first Escape closes the popup and leaves the
        // typed text alone. Nothing here clears the field — that is a second
        // press of a control this bar already has (the browser's own "×" on
        // `type="search"`).
        e.preventDefault();
        e.stopPropagation();
        closePopup();
      }
    }
  }

  /**
   * A click on an option fires the input's `blur` first, and a blur that
   * closes the popup beats the option's own `click` to the punch — the
   * listbox would be gone before the tap on it ever registers. `onMouseDown`
   * firing before `blur` is what every combobox implementation leans on to
   * stop that: prevent the default there so focus never leaves the input,
   * and let the option's own `onClick` do the choosing.
   */
  const keepFocus = (e) => e.preventDefault();

  return (
    <div className={`relative ${className}`}>
      <label className="flex h-12 items-center gap-3 rounded-card bg-surface px-4 shadow-card transition-shadow focus-within:shadow-lift lg:h-[52px] lg:px-5">
        {/* The label wraps the icon and input with no visible text of its
            own, so without this its accessible name falls back to the
            placeholder — which disappears the moment there's a value. */}
        <span className="sr-only">{label}</span>
        <Search className="size-[18px] shrink-0 text-muted" strokeWidth={2.4} />
        <input
          type="search"
          role={assisted ? "combobox" : undefined}
          aria-expanded={assisted ? open : undefined}
          aria-controls={assisted ? listboxId : undefined}
          aria-autocomplete={assisted ? "list" : undefined}
          aria-activedescendant={
            assisted && open && activeIndex >= 0
              ? optionId(activeIndex)
              : undefined
          }
          value={value}
          onChange={(e) => {
            onChange?.(e.target.value);
            if (assisted) {
              setOpen(true);
              setActiveIndex(-1);
            }
          }}
          onFocus={() => assisted && setOpen(true)}
          onBlur={closePopup}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          // An <input> carries an intrinsic width of about twenty characters,
          // and a flex item will not shrink below its intrinsic size without
          // this — the personals row puts four buttons beside this field on a
          // phone.
          className="w-full min-w-0 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted"
        />
      </label>

      {assisted && open && items.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="no-scrollbar absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-card bg-surface py-2 shadow-lift"
        >
          {items.map((item, i) => (
            <li
              key={item.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={keepFocus}
              onClick={() => choose(item)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-[14px] transition-colors ${
                i === activeIndex ? "bg-canvas text-ink" : "text-ink/85"
              }`}
            >
              <span className="min-w-0 truncate">{item.label}</span>
              {item.meta && (
                <span className="shrink-0 text-[12px] font-medium text-muted">
                  {item.meta}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
