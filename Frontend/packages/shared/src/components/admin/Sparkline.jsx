"use client";

import { useId } from "react";

/**
 * Inline SVG, no chart library. Four dashboard tiles do not justify a
 * dependency, and a line through eight points is thirty lines of geometry.
 *
 * It is decoration over a number that is already on the tile, so it is hidden
 * from assistive tech rather than given a label nobody can act on.
 */
export default function Sparkline({
  values = [],
  width = 120,
  height = 34,
  className = "",
}) {
  // Two sparklines on the same screen would otherwise mint the same gradient
  // id — duplicate ids in one document, and whichever <defs> lost the race.
  // Stripped of punctuation: React's ids carry colons, and `url(#:r0:)` is not
  // a reference every engine resolves.
  const gradientId = `spark${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero and collapse onto the top edge; give it
  // a range of 1 and let it draw down the middle.
  const span = max - min || 1;
  const step = width / (values.length - 1);
  // Inset by a pixel top and bottom so a peak is not clipped by the viewBox.
  const y = (v) => height - 1 - ((v - min) / span) * (height - 2);

  const points = values.map((v, i) => [i * step, y(v)]);
  const line = points
    .map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
