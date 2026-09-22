import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import {
  Skeleton,
  SkeletonGroup,
} from "@vezlist/shared/components/ui/Skeleton.jsx";

/**
 * Catch-all fallback for every `(shell)` route that doesn't ship a more
 * specific `loading.jsx` of its own (support, tickets, settings, the
 * launcher). Deliberately shape-neutral — those screens are a mix of
 * lists, forms and menus, not one repeating card — so this is a generic
 * content skeleton rather than a guess at any one of their layouts.
 * Routes with a real repeating shape (browse, nearby, ad, seller, profile)
 * override this with their own `loading.jsx` next to it.
 */
export default function Loading() {
  return (
    <PageBody className="px-4 pb-8 pt-4 lg:px-8">
      <SkeletonGroup label="Loading" className="space-y-3">
        <Skeleton className="h-6 w-2/5 rounded" />
        <Skeleton className="h-11 w-full rounded-card" />
        <div className="space-y-2.5 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      </SkeletonGroup>
    </PageBody>
  );
}
