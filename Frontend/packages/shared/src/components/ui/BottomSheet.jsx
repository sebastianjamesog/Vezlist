"use client";

/**
 * Sheet over the map on mobile; a side panel next to it on desktop.
 *
 * `header` is a separate slot rather than the first thing in `children`
 * because it is the part that survives a collapse — the title, the count and
 * the filter button stay put while the rows underneath fold away. Passing
 * `onToggle` is what turns the grab handle into a real control; without it the
 * handle is the same inert bar it has always been and the sheet cannot close.
 *
 * Collapsing is a mobile behaviour only. On `lg` this is a fixed side panel
 * beside the map, not on top of it, so there is nothing to get out of the way
 * of — every collapsed style below is overridden at that breakpoint.
 */
export default function BottomSheet({
  children,
  header = null,
  collapsed = false,
  onToggle,
  className = "",
}) {
  return (
    <section
      className={`relative -mt-8 flex min-h-0 flex-col rounded-t-sheet bg-canvas pt-2.5 shadow-sheet lg:mt-0 lg:w-[420px] lg:flex-none lg:rounded-none lg:border-l lg:border-line lg:bg-surface lg:pt-0 lg:shadow-none ${
        // `pb-nav` is load-bearing when collapsed: `BottomNav` floats over
        // whatever ends up at the bottom of `main`, and with the sheet folded
        // down there is no scrolling body left to carry the clearance the way
        // the expanded one does. Without it the count line lands underneath
        // the tab bar. `Footer` used to sit below this and clear the nav on
        // this screen's behalf; it is desktop-only now, which is exactly why
        // this cannot lean on it. Desktop has no floating nav, so it drops.
        collapsed ? "shrink-0 pb-nav lg:flex-1 lg:pb-0" : "flex-1"
      } ${className}`}
    >
      {onToggle ? (
        // The bar itself is 6px tall — a tap target that small is a miss
        // waiting to happen — so the button is full-width and padded around
        // it, and the bar is left as the thing you can see rather than the
        // thing you have to hit.
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls="sheet-body"
          className="mb-2 flex w-full shrink-0 justify-center py-1.5 lg:hidden"
        >
          <span className="h-1.5 w-11 rounded-full bg-line" />
          <span className="sr-only">
            {collapsed ? "Show the list" : "Hide the list"}
          </span>
        </button>
      ) : (
        <div className="mx-auto mb-2 h-1.5 w-11 rounded-full bg-line lg:hidden" />
      )}

      {header && <div className="shrink-0 px-4 lg:px-6 lg:pt-6">{header}</div>}

      <div
        id="sheet-body"
        className={`min-h-0 flex-1 overflow-y-auto px-4 pb-nav lg:px-6 lg:pb-6 ${
          header ? "lg:pt-0" : "lg:pt-6"
        } ${collapsed ? "hidden lg:block" : ""}`}
      >
        {children}
      </div>
    </section>
  );
}
