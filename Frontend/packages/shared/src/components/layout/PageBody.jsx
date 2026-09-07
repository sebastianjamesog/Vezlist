"use client";

/** Scroll container every screen shares, width-capped once we hit desktop. */
export default function PageBody({
  children,
  width = "max-w-7xl",
  className = "",
}) {
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto pb-nav lg:pb-0">
      <div className={`mx-auto w-full ${width} ${className}`}>{children}</div>
    </div>
  );
}
