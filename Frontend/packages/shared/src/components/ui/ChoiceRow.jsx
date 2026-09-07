"use client";

import { Check } from "lucide-react";

/**
 * One selectable line in a filter list — radio for "pick one", checkbox for
 * "pick any". `hint` is the muted right-hand detail (an area count, a result
 * count) that explains the option without widening the label.
 */
export default function ChoiceRow({ type, checked, onChange, hint, children }) {
  const box = type === "radio" ? "rounded-full" : "rounded-md";
  return (
    <button
      type="button"
      role={type === "radio" ? "radio" : "checkbox"}
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-canvas"
    >
      <span
        className={`grid size-5 shrink-0 place-items-center border-2 ${box} ${
          checked
            ? "border-brand bg-brand text-on-brand"
            : "border-line bg-surface"
        }`}
      >
        {checked &&
          (type === "radio" ? (
            <span className="size-2 rounded-full bg-white" />
          ) : (
            <Check className="size-3.5" strokeWidth={4} />
          ))}
      </span>

      <span className="min-w-0 flex-1 text-[15px] font-medium text-ink">
        {children}
      </span>

      {hint && (
        <span className="shrink-0 text-[13px] tabular-nums text-muted">
          {hint}
        </span>
      )}
    </button>
  );
}
