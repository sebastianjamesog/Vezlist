"use client";

import { NavLink } from "../../lib/nav";
import { X } from "lucide-react";
import { navItems } from "./navItems";

// Circles stretch to fill the bar, so the chain spans the screen instead of
// floating in the middle with dead space either side.
// Slots share the width evenly; each holds a 62px circle over the bar.
const CIRCLE = "min-w-0 flex-1 py-[6px]";

/**
 * Merged-circle tab bar. The black chain is drawn on a blurred layer behind the
 * icons and pulled back to hard edges by the alpha matrix, so neighbouring
 * circles fuse instead of just overlapping. Icons live on an unfiltered layer
 * above it or the blur would smear them too.
 */
function GooFilter() {
  return (
    <svg aria-hidden="true" className="absolute size-0" focusable="false">
      <defs>
        <filter id="nav-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -12"
          />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * The live tab is a white disc *inside* its slot rather than a lifted disc on
 * top of it: a lifted disc with a canvas ring cut the end circles loose from the
 * chain, and the whole point of the goo is that the chain never breaks.
 */
function Slot({ Icon, active, create, open }) {
  const pressed = active || (create && open);
  // Create turns into its own dismiss button while the sheet is up.
  const Glyph = create && open ? X : Icon;

  return (
    <span
      className={`grid size-full place-items-center rounded-full ${
        create ? "bg-gradient-to-br from-brand to-brand-strong" : ""
      }`}
    >
      <span
        className={`grid place-items-center rounded-full transition-all duration-300 ease-out ${
          pressed
            ? "size-[48px] bg-white shadow-[0_4px_12px_-4px_rgb(15_23_42/0.5)]"
            : "size-full"
        }`}
      >
        <Glyph
          className={`size-7 transition-colors ${pressed ? "text-brand" : "text-white"}`}
          strokeWidth={pressed || create ? 2.4 : 1.9}
        />
      </span>
    </span>
  );
}

export default function BottomNav({ onPostAd, createOpen = false }) {
  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1001] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 lg:hidden"
    >
      <GooFilter />

      <div className="relative mx-auto w-full max-w-[28rem]">
        {/* The fused chain: a full-width bar with a circle bulging at each slot,
            welded together by the goo filter so it reads as one wavy blob. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center"
          style={{
            filter:
              "url(#nav-goo) drop-shadow(0 6px 14px rgb(15 23 42 / 0.18))",
          }}
        >
          <span
            // Stops at the first and last slot centre (half a slot = 100/(2*5)%)
            // so the chain terminates in full circles, not a thin bar stub.
            className="absolute inset-x-[10%] top-1/2 h-[34px] -translate-y-1/2 rounded-full bg-gradient-to-b from-[#23232e] to-[#0b0b12]"
          />
          {navItems.map((item) => (
            <span key={item.id} className={CIRCLE}>
              <span className="mx-auto block size-[62px] rounded-full bg-gradient-to-b from-[#23232e] to-[#0b0b12]" />
            </span>
          ))}
        </div>

        <ul className="pointer-events-auto relative flex w-full items-center">
          {navItems.map((item) => (
            <li key={item.id} className={CIRCLE}>
              {item.action === "create" ? (
                <button
                  onClick={onPostAd}
                  aria-label={
                    createOpen ? "Close the new ad form" : "Create an ad"
                  }
                  aria-expanded={createOpen}
                  className="mx-auto block size-[62px] rounded-full transition-transform active:scale-95"
                >
                  <Slot Icon={item.Icon} create open={createOpen} />
                </button>
              ) : (
                <NavLink
                  to={item.to}
                  end={item.end}
                  aria-label={item.label}
                  className="mx-auto block size-[62px] rounded-full transition-transform active:scale-95"
                >
                  {({ isActive }) => (
                    <Slot Icon={item.Icon} active={isActive} />
                  )}
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
