/**
 * Loading placeholders for the three shapes that repeat across both boards:
 * a feed row (`ListingCard` / `NearbyListingCard`), a people row/tile
 * (`PersonCard`), and a console table row (`DataTable`). Each one mirrors its
 * real component's box sizes so a route's `loading.jsx` doesn't jump when the
 * real content swaps in.
 *
 * No server component boundary here on purpose — `Skeleton` is pure markup
 * and CSS, so it needs no `"use client"` and stays renderable from either.
 *
 * Motion: `animate-pulse` is Tailwind's own keyframe. It is not re-declared
 * here because `packages/shared/src/index.css` already carries a global
 * `@media (prefers-reduced-motion: reduce)` block that squashes every
 * `animation-duration` on `*` to 0.01ms — these tiles inherit that for free
 * and have nothing of their own to turn off.
 */

/** One pulsing block. Every shape below is built out of these. */
export function Skeleton({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-line ${className}`}
    />
  );
}

/**
 * Wraps a cluster of `Skeleton` tiles with the one thing raw `<div>`s can't
 * give assistive tech on their own: a name for what's happening and a single
 * announcement instead of one per tile.
 */
export function SkeletonGroup({ label = "Loading", className = "", children }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={className}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/**
 * Matches `components/cards/ListingCard.jsx`'s row layout: a square photo,
 * a two-line title, a meta line, and a chip row. Used for the marketplace
 * feed, saved ads, my-ads, and anywhere else that lists ads in a row.
 */
export function ListingCardSkeleton() {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-surface p-3 shadow-card lg:gap-4 lg:p-4">
      <Skeleton className="size-[96px] shrink-0 rounded-xl lg:size-[112px]" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-[15px] w-[88%] rounded" />
        <Skeleton className="mt-2 h-[15px] w-[55%] rounded" />
        <div className="mt-2.5 flex min-h-[22px] items-center gap-1.5">
          <Skeleton className="h-[14px] w-20 rounded" />
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1.5 lg:mt-3">
          <Skeleton className="h-[22px] w-14 rounded-lg" />
          <Skeleton className="h-[22px] w-20 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/**
 * Matches `components/cards/PersonCard.jsx`. `variant="tile"` is the photo
 * grid (personals discovery / live); `variant="row"` (default) is the
 * compact list row.
 */
export function PersonCardSkeleton({ variant = "row" }) {
  if (variant === "tile") {
    return <Skeleton className="aspect-[3/4] w-full rounded-card" />;
  }
  return (
    <div className="flex gap-3 rounded-card bg-surface p-2.5 shadow-card">
      <Skeleton className="size-16 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1 py-0.5">
        <Skeleton className="h-[15px] w-2/3 rounded" />
        <div className="mt-2 flex items-center gap-2">
          <Skeleton className="h-[20px] w-14 rounded-lg" />
          <Skeleton className="h-[14px] w-20 rounded" />
        </div>
        <Skeleton className="mt-2 h-[12px] w-1/2 rounded" />
      </div>
    </div>
  );
}

/**
 * Matches one `<tr>` of `components/admin/DataTable.jsx` — same cell
 * padding, same optional leading checkbox column, so a table of these sits
 * at the row height the real data will render at. Render inside a `<tbody>`;
 * pair with `TableHeaderSkeleton` for the `<thead>` above it.
 */
export function TableRowSkeleton({ columns = 4, selectable = false }) {
  return (
    <tr className="border-b border-line last:border-0">
      {selectable && (
        <td className="px-4 py-3">
          <Skeleton className="size-4 rounded" />
        </td>
      )}
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-[14px] w-full max-w-[140px] rounded" />
        </td>
      ))}
    </tr>
  );
}

/** The `<thead>` row that goes with `TableRowSkeleton` — same cell shape, one per column. */
export function TableHeaderSkeleton({ columns = 4, selectable = false }) {
  return (
    <tr className="border-b border-line">
      {selectable && (
        <th className="w-10 px-4 py-3">
          <Skeleton className="size-4 rounded" />
        </th>
      )}
      {Array.from({ length: columns }).map((_, i) => (
        <th key={i} className="px-4 py-3">
          <Skeleton className="h-[11px] w-16 rounded" />
        </th>
      ))}
    </tr>
  );
}
