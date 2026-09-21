import BottomSheet from "@vezlist/shared/components/ui/BottomSheet.jsx";
import {
  Skeleton,
  SkeletonGroup,
  ListingCardSkeleton,
} from "@vezlist/shared/components/ui/Skeleton.jsx";

/**
 * Mirrors pages/Nearby.jsx: a map pane (Leaflet loads client-only through
 * `next/dynamic`, so this is what's on screen until that chunk arrives) over
 * a bottom sheet of listing rows. Reuses the real `BottomSheet` chrome —
 * it's static markup, so the skeleton sits in the exact sheet the real list
 * renders into rather than an approximation of it.
 */
export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div
        aria-hidden="true"
        className="h-[46%] shrink-0 animate-pulse bg-line lg:h-auto lg:min-h-0 lg:flex-1"
      />

      <BottomSheet>
        <SkeletonGroup label="Loading nearby listings">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-40 rounded" />
              <Skeleton className="h-3.5 w-24 rounded" />
            </div>
            <Skeleton className="size-11 shrink-0 rounded-card" />
          </div>
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <ListingCardSkeleton key={i} />
            ))}
          </div>
        </SkeletonGroup>
      </BottomSheet>
    </div>
  );
}
