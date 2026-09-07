"use client";

import { SITE_NAME, SITE_TAGLINE } from "../../lib/sites";

/** Gradient mark + name. The mark alone carries the brand in tight spaces. */
export default function Wordmark({
  size = "md",
  markOnly = false,
  nameOnly = false,
}) {
  const big = size === "lg";

  return (
    <div className="flex items-center gap-2.5">
      {!nameOnly && (
        <span
          aria-hidden="true"
          className={`brand-gradient grid shrink-0 place-items-center font-extrabold text-white shadow-pop ${
            big
              ? "size-11 rounded-[14px] text-[22px]"
              : "size-9 rounded-xl text-[18px]"
          }`}
        >
          {SITE_NAME[0]}
        </span>
      )}

      {!markOnly && (
        <span className="leading-none">
          <span
            className={`block font-extrabold tracking-tight text-ink ${
              big ? "text-[24px]" : "text-[20px]"
            }`}
          >
            {SITE_NAME}
          </span>
          {big && (
            <span className="mt-1 block text-[11px] font-medium text-muted">
              {SITE_TAGLINE}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
