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
 * Matches `components/cards/ListingCard.jsx`'s compact row layout so the
 * content does not jump when a feed swaps from loading to real cards.
 */
export function ListingCardSkeleton() {
  return (
    <div className="listing-card-skeleton-container min-w-0">
      <div className="listing-card-skeleton flex min-w-0 items-center gap-2 rounded-2xl bg-surface p-2 shadow-card">
        <Skeleton className="listing-card-skeleton__photo size-[104px] shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="listing-card-skeleton__title min-h-9">
            <Skeleton className="h-[15px] w-[88%] rounded" />
            <Skeleton className="mt-1.5 h-[15px] w-[55%] rounded" />
          </div>
          <div className="listing-card-skeleton__meta mt-0.5 flex h-[18px] items-center gap-1.5">
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-4 w-14 rounded" />
          </div>
          <div className="listing-card-skeleton__meta mt-0.5 flex h-[18px] min-w-0 items-center gap-1.5">
            <Skeleton className="h-[18px] w-14 rounded-lg" />
            <Skeleton className="h-3 w-12 rounded" />
            <Skeleton className="h-3 min-w-0 flex-1 rounded" />
            <Skeleton className="ml-auto h-3 w-12 rounded" />
          </div>
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
