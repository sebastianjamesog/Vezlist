import {
  Skeleton,
  SkeletonGroup,
  TableHeaderSkeleton,
  TableRowSkeleton,
} from "@vezlist/shared/components/ui/Skeleton.jsx";

/**
 * One fallback for every console section (dashboard, listings, users,
 * tickets, reports, audit, analytics, taxonomy, content, live,
 * notifications, settings, status, admins) rather than thirteen near-copies:
 * every one of them opens with an `AdminHeader` and is either a `StatCard`
 * row, a `DataTable`, or both — this renders both, so the shape reads as
 * "console screen loading" regardless of which section it resolves into.
 */
export default function Loading() {
  return (
    <SkeletonGroup label="Loading" className="space-y-5">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-7 w-64 rounded" />
          <Skeleton className="h-4 w-44 rounded" />
        </div>
        <Skeleton className="h-9 w-32 rounded-xl" />
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-card bg-surface p-4 shadow-card lg:p-5"
          >
            <Skeleton className="h-3.5 w-20 rounded" />
            <Skeleton className="mt-2 h-7 w-14 rounded" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <TableHeaderSkeleton columns={5} selectable />
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={5} selectable />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SkeletonGroup>
  );
}
