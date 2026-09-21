import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import {
  Skeleton,
  SkeletonGroup,
  ListingCardSkeleton,
} from "@vezlist/shared/components/ui/Skeleton.jsx";

/**
 * Fallback for `/` — the personals home screen doubles as the board's feed
 * (there is no separate `/browse` on this site; see `lib/sites.js`'s
 * `FEED_PATH`), so this mirrors the marketplace's browse skeleton: search
 * row, story rail, then the feed grid. Also covers `/support` and its
 * subpages, which don't ship a more specific `loading.jsx`.
 */
export default function Loading() {
  return (
    <PageBody className="px-4 pb-8 lg:px-8">
      <SkeletonGroup label="Loading">
        <div className="pb-3 pt-3 lg:pt-4">
          <div className="flex gap-2.5">
            <Skeleton className="h-12 min-w-0 flex-1 rounded-card lg:h-[52px]" />
            <Skeleton className="size-12 shrink-0 rounded-card lg:size-[52px]" />
            <Skeleton className="size-12 shrink-0 rounded-card lg:size-[52px]" />
          </div>
          <Skeleton className="mt-2.5 h-10 w-full rounded-card" />
          <div className="mt-3 flex gap-2.5 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-24 shrink-0 rounded-2xl" />
            ))}
          </div>
        </div>

        <div className="flex gap-3 overflow-hidden pb-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="size-16 shrink-0 rounded-full" />
          ))}
        </div>

        <div className="pt-3">
          <Skeleton className="mb-3 h-5 w-24 rounded" />
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
