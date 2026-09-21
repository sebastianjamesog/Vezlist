"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Image from "next/image";

// `useLayoutEffect` warns during SSR ("does nothing on the server"); every
// call site here is already a client component, but the module itself still
// gets evaluated during the server render that produces the first HTML, so
// the hook needs a same-signature stand-in for that pass.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Whether the visitor's discreet mode is on right now, read from the same
 * `data-discreet` attribute on `<html>` that the CSS blur rule keys off
 * (`[data-discreet="on"] [data-media]` in index.css) and that
 * apps/personals/app/useDiscreet.js sets from a pre-hydration script. Not a
 * context read: this file lives in the shared package and can't import an
 * app's provider, and the attribute is already the one thing every
 * consumer — CSS, this hook, the inline script — agrees on.
 *
 * `enabled` gates the observer rather than being checked by the caller,
 * so a `MediaImage` that never asked about discreet mode (the marketplace,
 * the admin console, most of the personals board's own chrome) doesn't pay
 * for a `MutationObserver` it has no use for.
 *
 * Starts withheld (`true`) on every render this hook fires for — server,
 * and the first client pass — so a component that opts in never disagrees
 * with its own server-rendered markup, and a page whose discreet state we
 * have not yet confirmed stays closed rather than momentarily open. The
 * real value lands one effect later, exactly like `usePersistedFlag` itself
 * does for the switch this reads.
 */
function useDiscreetOn(enabled) {
  const [on, setOn] = useState(true);

  useIsomorphicLayoutEffect(() => {
    if (!enabled) return undefined;
    const root = document.documentElement;
    const sync = () => setOn(root.dataset.discreet === "on");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-discreet"],
    });
    return () => observer.disconnect();
  }, [enabled]);

  return on;
}

/**
 * One image component for (almost) every render site in the app.
 *
 * Two concerns, one wrapper, because building the second meant rewriting
 * every render site anyway:
 *
 *  1. Delivery. This is `next/image` underneath — automatic lazy loading,
 *     `decoding="async"`, and layout-stable sizing everywhere a raw `<img>`
 *     used to sit. See next.config.mjs for why it runs `unoptimized`
 *     (no responsive `srcSet`/AVIF negotiation yet) rather than through the
 *     optimizer — that is a hosting constraint, not a choice made here.
 *
 *  2. Withholding, where asked. `discreet` (public personals render sites)
 *     or a controlled `revealed` prop (the admin console's per-screen
 *     reveal, see components/admin/RevealMedia.jsx) makes this component
 *     render a placeholder instead of an `<Image>` — no `src`, no request —
 *     until the surface says otherwise. A plain `<MediaImage>` with neither
 *     prop (most call sites: catalogue thumbnails, avatars, admin tables)
 *     never withholds anything; it is just the `next/image` half.
 *
 * Reveal granularity is whatever the caller's existing reveal control
 * already grants — the personals discreet toggle (session-wide) or the
 * admin Reveal button (screen-wide) — not a new per-image tap target.
 * Neither surface has ever offered a way to reveal one photo at a time;
 * building that is a UX project of its own, not implied by "don't fetch it
 * until revealed."
 *
 * The cost of withholding is real and not hidden: a revealed image starts
 * its network fetch at the moment of reveal, so it appears slower than a
 * blurred-but-already-loaded image did before. That is the feature working.
 */
export default function MediaImage({
  src,
  alt,
  discreet = false,
  revealed,
  fill = false,
  width,
  height,
  sizes,
  className = "",
  loading,
  preload = false,
  "data-media": dataMedia,
  ...rest
}) {
  const controlled = typeof revealed === "boolean";
  const globalOn = useDiscreetOn(discreet && !controlled);
  const withheld = controlled ? !revealed : discreet && globalOn;

  // `next/image` throws if handed a falsy `src`; a raw `<img>` just showed a
  // broken-image box. A handful of call sites read from data that can be
  // momentarily absent (an admin profile before auth resolves) — rendering
  // nothing is closer to the old behaviour than either alternative.
  if (!withheld && !src) return null;

  // Every discreet-aware or reveal-aware instance carries `data-media` even
  // while withheld, whether or not the caller passed it: the CSS rule and
  // this component agree on the same marker, and a placeholder that is
  // itself the thing discreet mode would have blurred should say so.
  const markMedia = dataMedia ?? (discreet || controlled);

  if (withheld) {
    const hiddenLabel = alt
      ? `${alt} — hidden until revealed`
      : "Hidden until revealed";
    return (
      <span
        {...(markMedia ? { "data-media": true } : null)}
        role="img"
        aria-label={hiddenLabel}
        className={
          fill
            ? `absolute inset-0 block bg-canvas ${className}`
            : `block shrink-0 bg-canvas ${className}`
        }
        style={fill ? undefined : { width, height }}
      />
    );
  }

  return (
    <Image
      {...(markMedia ? { "data-media": true } : null)}
      src={src}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizes}
      loading={preload ? undefined : (loading ?? "lazy")}
      preload={preload}
      className={className}
      {...rest}
    />
  );
}
