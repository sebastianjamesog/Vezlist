import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import {
  Skeleton,
  SkeletonGroup,
} from "@vezlist/shared/components/ui/Skeleton.jsx";

/**
 * Fallback for `/profile` and — because a segment's `loading.jsx` covers any
 * child segment that doesn't ship its own (see `loading.js` docs: it wraps
 * "the page.js file and any children below") — for the settings/ads/
 * dashboard/saved/notifications subpages too, none of which have a
 * more specific one of their own. The hero card + menu-row shape below is
 * closest to the hub itself; the list subpages (My Ads, Saved) still read
 * fine against it since a listing row and a menu row are both a photo/icon
 * plus two lines.
 */
export default function Loading() {
  return (
    <PageBody className="px-4 pb-8 lg:px-8">
      <SkeletonGroup label="Loading profile" className="pt-3 lg:pt-4">
        <div className="brand-gradient rounded-card p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-16 shrink-0 rounded-full bg-on-brand/25" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-1/2 rounded bg-on-brand/25" />
              <Skeleton className="h-3.5 w-1/3 rounded bg-on-brand/25" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-16 flex-1 rounded-2xl bg-on-brand/15" />
            <Skeleton className="h-16 flex-1 rounded-2xl bg-on-brand/15" />
            <Skeleton className="h-16 flex-1 rounded-2xl bg-on-brand/15" />
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-card"
            >
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <Skeleton className="h-4 flex-1 rounded" />
            </div>
          ))}
        </div>
      </SkeletonGroup>
    </PageBody>
  );
}
