import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import {
  Skeleton,
  SkeletonGroup,
  ListingCardSkeleton,
} from "@vezlist/shared/components/ui/Skeleton.jsx";

/**
 * Mirrors pages/SellerProfile.jsx: a sub-page bar, a profile card (avatar,
 * name, rating), then the seller's own listing rows.
 */
export default function Loading() {
  return (
    <>
      <header className="glass sticky top-0 z-30 px-4 py-3 lg:px-8 lg:py-4">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3 rounded" />
            <Skeleton className="h-3 w-1/4 rounded" />
          </div>
        </div>
      </header>

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        <SkeletonGroup label="Loading seller">
          <section className="rounded-card bg-surface p-5 shadow-card lg:p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="size-20 shrink-0 rounded-full lg:size-24" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-2/3 rounded" />
                <Skeleton className="h-4 w-1/3 rounded" />
              </div>
            </div>
          </section>

          <div className="mt-5 grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ListingCardSkeleton key={i} />
            ))}
          </div>
        </SkeletonGroup>
      </PageBody>
    </>
  );
}
