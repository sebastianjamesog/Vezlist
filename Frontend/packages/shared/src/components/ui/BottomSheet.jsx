"use client";

/** Sheet over the map on mobile; a side panel next to it on desktop. */
export default function BottomSheet({ children, className = "" }) {
  return (
    <section
      className={`relative -mt-8 flex min-h-0 flex-1 flex-col rounded-t-sheet bg-canvas pt-2.5 shadow-sheet lg:mt-0 lg:w-[420px] lg:flex-none lg:rounded-none lg:border-l lg:border-line lg:bg-surface lg:pt-0 lg:shadow-none ${className}`}
    >
      <div className="mx-auto mb-2 h-1.5 w-11 rounded-full bg-line lg:hidden" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-nav lg:px-6 lg:py-6">
        {children}
      </div>
    </section>
  );
}
