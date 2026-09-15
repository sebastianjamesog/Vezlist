"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

export default function Accordion({ items }) {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div className="divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.q}>
            <button
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-canvas/60"
            >
              <span className="text-[15px] font-bold text-ink">{item.q}</span>
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full transition-all duration-200 ${
                  open
                    ? "rotate-45 bg-brand text-on-brand"
                    : "bg-canvas text-muted"
                }`}
              >
                <Plus className="size-4" strokeWidth={3} />
              </span>
            </button>
            {open && (
              <p className="px-5 pb-5 text-[14px] leading-relaxed text-muted">
                {item.a}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
