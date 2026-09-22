import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import {
  Skeleton,
  SkeletonGroup,
  ListingCardSkeleton,
} from "@vezlist/shared/components/ui/Skeleton.jsx";

/**
 * Mirrors BrowseScreen.jsx's shape: search row, shortcut rail, heading, then
 * the feed grid — same breakpoints as the real `grid-cols-1 lg:grid-cols-2
 * xl:grid-cols-3` so the skeleton doesn't reflow when the real cards land.
 */
export default function Loading() {
  return (
    <PageBody className="px-4 pb-8 lg:px-8">
      <SkeletonGroup label="Loading ads">
        <div className="pb-3 pt-3 lg:pt-4">
          <div className="flex gap-2.5">
            <Skeleton className="h-12 flex-1 rounded-card lg:h-[52px]" />
            <Skeleton className="size-12 shrink-0 rounded-card lg:size-[52px]" />
          </div>
          <Skeleton className="mt-2.5 h-10 w-full rounded-card" />
          <div className="mt-3 flex gap-2.5 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-24 shrink-0 rounded-2xl" />
            ))}
          </div>
        </div>

        <div className="pt-1">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-32 rounded" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ListingCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </SkeletonGroup>
    </PageBody>
  );
}
