"use client";

/**
 * Scroll container every screen shares, width-capped once we hit desktop.
 *
 * `pb-nav` is the clearance for the tab bar, which floats over the screen
 * rather than reserving a band under it — without it the last row of any feed
 * sits behind the bar. That is the right default because most screens end in
 * their own content.
 *
 * `pinnedFooter` is for the few that do not: a screen that pins its own bar
 * below this container — a reply composer, an action bar — is the thing the
 * tab bar would cover, so the clearance belongs on *that* element and paying
 * for it twice leaves a band of dead canvas between the last row and the
 * footer. Passing this moves the responsibility rather than removing it, so a
 * screen that opts in must carry `pb-nav` on its own footer.
 */
export default function PageBody({
  children,
  width = "max-w-7xl",
  className = "",
  pinnedFooter = false,
}) {
  return (
    <div
      data-scroll
      className={`min-h-0 flex-1 overflow-y-auto ${
        pinnedFooter ? "" : "pb-nav lg:pb-0"
      }`}
    >
      <div className={`mx-auto w-full ${width} ${className}`}>{children}</div>
    </div>
  );
}
