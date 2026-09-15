"use client";

export const FIELD =
  "w-full rounded-xl border bg-surface px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted";

export default function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-bold text-ink">{label}</span>
        {hint && <span className="text-[12px] text-muted">{hint}</span>}
      </span>
      {children}
      {error && (
        <span
          role="alert"
          className="mt-1.5 block text-[13px] font-medium text-red-600"
        >
          {error}
        </span>
      )}
    </label>
  );
}

export const border = (error) =>
  error ? "border-red-400" : "border-line focus:border-brand";
