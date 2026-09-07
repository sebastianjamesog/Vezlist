"use client";

import { Search } from "lucide-react";

/** Raised pill. No border — elevation separates it from the canvas instead. */
export default function SearchBar({
  placeholder = "Search...",
  value,
  onChange,
  className = "",
}) {
  return (
    <label
      className={`flex h-12 items-center gap-3 rounded-card bg-surface px-4 shadow-card transition-shadow focus-within:shadow-lift lg:h-[52px] lg:px-5 ${className}`}
    >
      <Search className="size-[18px] shrink-0 text-muted" strokeWidth={2.4} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted"
      />
    </label>
  );
}
