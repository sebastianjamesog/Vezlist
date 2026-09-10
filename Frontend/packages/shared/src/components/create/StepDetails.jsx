"use client";

import Field, { FIELD, border } from "./Field";
import { useCatalog } from "../../context/CatalogContext";

export default function StepDetails({ draft, errors, onPatch }) {
  const { categories } = useCatalog();

  return (
    <div className="space-y-4">
      <Field
        label="Title"
        error={errors.title}
        hint={`${draft.title.length}/70`}
      >
        <input
          value={draft.title}
          maxLength={70}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder="e.g. 2 Bedroom Apartment for Rent"
          className={`${FIELD} ${border(errors.title)}`}
        />
      </Field>

      <Field label="Business / Seller name" error={errors.business}>
        <input
          value={draft.business}
          onChange={(e) => onPatch({ business: e.target.value })}
          placeholder="e.g. Modern City Apartments"
          className={`${FIELD} ${border(errors.business)}`}
        />
      </Field>

      <Field label="Category" error={errors.category}>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={draft.category === category.label}
              onClick={() =>
                onPatch({ category: category.label, categoryId: category.id })
              }
              className={`rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors ${
                draft.category === category.label
                  ? "border-brand bg-brand text-on-brand"
                  : "border-line text-ink hover:bg-canvas"
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Price" hint="Optional" error={errors.price}>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-muted">
            $
          </span>
          <input
            value={draft.price}
            onChange={(e) => onPatch({ price: e.target.value })}
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="0"
            className={`${FIELD} ${border(errors.price)} pl-8`}
          />
        </div>
      </Field>

      <Field
        label="Description"
        hint={`${draft.description.trim().length}/20 min`}
        error={errors.description}
      >
        <textarea
          value={draft.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          rows={5}
          placeholder="Condition, why you're selling, what's included..."
          className={`${FIELD} ${border(errors.description)} resize-none`}
        />
      </Field>
    </div>
  );
}
