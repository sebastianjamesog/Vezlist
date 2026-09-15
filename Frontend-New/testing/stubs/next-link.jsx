/**
 * `next/link` for jsdom.
 *
 * Renders the anchor Next renders, minus the router prefetch — which is what
 * every test here actually asserts on, since the assertion is always "this row
 * is a link to that ad", never "the router was told to prefetch it".
 */
export default function Link({
  href,
  children,
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  ...rest
}) {
  return (
    <a href={typeof href === "string" ? href : ""} {...rest}>
      {children}
    </a>
  );
}
