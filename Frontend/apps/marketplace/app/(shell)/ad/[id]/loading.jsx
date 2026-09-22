import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import {
  Skeleton,
  SkeletonGroup,
} from "@vezlist/shared/components/ui/Skeleton.jsx";

/**
 * Mirrors pages/AdDetail.jsx: a detail app bar, a photo gallery, then the
 * summary/description column that becomes a two-column grid at `lg`.
 */
export default function Loading() {
  return (
    <>
      <header className="glass sticky top-0 z-30 shrink-0 px-2 py-2 lg:px-6 lg:py-3">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-2">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-1/3 rounded" />
        </div>
      </header>

      <PageBody className="px-4 pb-6 lg:px-8 lg:py-8">
        <SkeletonGroup
          label="Loading ad"
          className="lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-x-8 lg:gap-y-6"
        >
          <div className="lg:col-start-1 lg:row-start-1">
            <Skeleton className="aspect-[4/3] w-full rounded-card" />
            <div className="mt-3 flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="size-16 shrink-0 rounded-lg" />
              ))}
            </div>
          </div>

          <div className="mt-6 space-y-2 lg:col-start-2 lg:row-start-1 lg:mt-0">
            <Skeleton className="h-6 w-3/4 rounded" />
            <Skeleton className="h-8 w-1/3 rounded" />
            <Skeleton className="h-4 w-1/2 rounded" />
            <div className="mt-4 flex items-center gap-3 rounded-card bg-surface p-4 shadow-card">
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/3 rounded" />
                <Skeleton className="h-3 w-1/3 rounded" />
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-2 lg:col-start-1 lg:row-start-2">
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-2/3 rounded" />
          </div>
        </SkeletonGroup>
      </PageBody>
    </>
  );
}
