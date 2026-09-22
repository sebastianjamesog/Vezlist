"use client";

import { useEffect, useId } from "react";
import { SITE_SCOPE } from "../../lib/api/client.js";
import useCategoryCatalog from "./useCategoryCatalog.js";

export default function CategoryPicker({ draft, error, onPatch }) {
  const id = useId();
  const { status, categories, retry } = useCategoryCatalog(SITE_SCOPE);

  useEffect(() => {
    // A failed request cannot establish that a saved category was removed.
    if (status !== "success" || !draft.categoryId) return;
    const selected = categories.find(
      (category) => category.id === draft.categoryId,
    );
    if (!selected) onPatch({ categoryId: "" });
    else if (selected.label !== draft.category)
      onPatch({ category: selected.label });
  }, [status, categories, draft.categoryId, draft.category, onPatch]);

  const duplicateLabels = new Set(
    categories
      .filter(
        (category, index) =>
          categories.findIndex((other) => other.label === category.label) !==
          index,
      )
      .map((category) => category.label),
  );

  return (
    <fieldset
      className="min-w-0"
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="mb-1.5 text-[14px] font-bold text-ink">
        Category
      </legend>
      {status === "loading" && (
        <p role="status" className="text-[13px] text-muted">
          Loading categories...
        </p>
      )}
      {status === "error" && (
        <div
          role="alert"
          className="flex items-center gap-2 text-[13px] text-red-600"
        >
          <span>Could not load categories.</span>
          <button
            type="button"
            onClick={retry}
            className="rounded font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Retry
          </button>
        </div>
      )}
      {status === "success" && !categories.length && (
        <p role="status" className="text-[13px] text-muted">
          No categories are available for this board yet.
        </p>
      )}
      {status === "success" && categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={draft.categoryId === category.id}
              aria-label={
                duplicateLabels.has(category.label)
                  ? `${category.label} (${category.id})`
                  : undefined
              }
              onClick={() =>
                onPatch({
                  category: category.label,
                  categoryId: category.id,
                  ...(draft.categoryId !== category.id
                    ? { subcategory: "" }
                    : {}),
                })
              }
              className={`max-w-full rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${draft.categoryId === category.id ? "border-brand bg-brand text-on-brand" : "border-line text-ink hover:bg-canvas"}`}
            >
              {category.label}
              {duplicateLabels.has(category.label) && (
                <span className="text-[12px] font-normal">
                  {" "}
                  ({category.id})
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {draft.category && !draft.categoryId && (
        <p role="status" className="mt-2 text-[13px] text-muted">
          Choose a category from the current list. Your saved category was "
          {draft.category}".
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 text-[13px] font-medium text-red-600"
        >
          {error}
        </p>
      )}
    </fieldset>
  );
}
