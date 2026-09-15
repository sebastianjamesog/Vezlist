import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import {
  Skeleton,
  SkeletonGroup,
} from "@vezlist/shared/components/ui/Skeleton.jsx";

/**
 * Mirrors `app/(shell)/live/page.jsx`'s `StreamTile` grid — a photo-led
 * 2/4-column grid of `aspect-[3/4]` tiles, personals-only.
 */
export default function Loading() {
  return (
    <>
      <header className="glass sticky top-0 z-30 px-4 py-3 lg:px-8 lg:py-4">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/4 rounded" />
            <Skeleton className="h-3 w-1/3 rounded" />
          </div>
        </div>
      </header>

      <PageBody className="px-4 pb-8 lg:px-8">
        <SkeletonGroup label="Loading live streams" className="pt-1">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full rounded-2xl" />
            ))}
          </div>
        </SkeletonGroup>
      </PageBody>
    </>
  );
}
