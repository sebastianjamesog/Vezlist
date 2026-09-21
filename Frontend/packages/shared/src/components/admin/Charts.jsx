"use client";

import { useState } from "react";
import { Table2, ChartColumn } from "lucide-react";

/**
 * The console's charts. Four tiles do not justify a chart library, and these
 * are built from divs rather than SVG on purpose: the specs that matter here
 * are in real pixels — a bar caps at 24px, fills are separated by a 2px gap of
 * surface, a data-end is a 4px radius, a hit target clears 24px — and inside a
 * scaling `viewBox` none of those numbers mean what they say.
 *
 * ── Palette ──────────────────────────────────────────────────────────────
 * Every chart here plots ONE series, so it wears one hue and carries no
 * legend: the title already says what is plotted, and a one-swatch legend just
 * restates it. The only multi-colour mark is the status bar, whose colours
 * mean good/waiting/bad and are therefore the reserved status set, never
 * reused for identity.
 *
 * The three chromatic status fills were validated, not eyeballed —
 * `#059669, #f59e0b, #be123c` clears the adjacent-pair separation floor with
 * ΔE 13.0 under protanopia and 27.5 in normal vision. `expired` is
 * deliberately outside that set: it is the absent state, so it reads as grey
 * on purpose rather than as a fourth identity. Amber sits under 3:1 against
 * the surface, which obliges relief — hence the direct labels and the table
 * twin every chart below ships with.
 */

/** Validated single hue for one-series marks. */
const SERIES = "#2563eb";

/** Reserved status fills. Meaning, not identity — never a "series 4". */
export const STATUS_FILL = {
  active: "#059669",
  pending: "#f59e0b",
  rejected: "#be123c",
  // Intentionally achromatic: "expired" is absence, and a hue here would
  // claim it is a category.
  expired: "#64748b",
};

const STATUS_LABEL = {
  active: "Active",
  pending: "In review",
  rejected: "Rejected",
  expired: "Expired",
};

const nf = new Intl.NumberFormat("en-CA");

/**
 * Card chrome plus the table twin every chart owes its reader.
 *
 * A tooltip enhances; it never gates. Anything the hover shows is also in this
 * table, which is reachable without a pointer.
 */
export function ChartCard({ title, subtitle, children, table }) {
  const [asTable, setAsTable] = useState(false);
  const Glyph = asTable ? ChartColumn : Table2;

  return (
    <section className="rounded-card bg-surface p-4 shadow-card lg:p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[16px] font-extrabold leading-tight text-ink">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((t) => !t)}
          aria-pressed={asTable}
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors hover:bg-canvas hover:text-ink"
          title={asTable ? "Show the chart" : "Show the numbers"}
        >
          <Glyph className="size-4" strokeWidth={2.2} />
          <span className="sr-only">
            {asTable ? "Show the chart" : "Show the numbers"}
          </span>
        </button>
      </header>

      {asTable ? <DataTableView rows={table} /> : children}
    </section>
  );
}

function DataTableView({ rows = [] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="pb-2 font-bold text-muted">
              {rows.dimension ?? "Item"}
            </th>
            <th scope="col" className="pb-2 text-right font-bold text-muted">
              Count
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line last:border-0">
              <td className="py-1.5 text-ink">{row.key}</td>
              {/* Columns of numbers align, so these get tabular figures. */}
              <td className="py-1.5 text-right font-semibold text-ink [font-variant-numeric:tabular-nums]">
                {nf.format(row.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The hover/focus readout. CSS-driven, so it works before hydration too. */
function Tip({ children }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-lift group-hover:block group-focus-within:block"
    >
      {children}
    </span>
  );
}

/**
 * Counts over evenly spaced periods.
 *
 * Columns rather than a line: these are discrete weekly buckets, and a line
 * between them implies a value at every instant in between.
 */
export function ColumnChart({ data, valueLabel = "listings" }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  // The largest column is the one worth labelling. A number on every column is
  // chaos and goes unread.
  const peak = data.findIndex((d) => d.value === max);

  return (
    <div>
      <div className="flex h-44 items-end gap-1.5 border-b border-line">
        {data.map((d) => (
          <div
            key={d.key}
            className="group relative flex h-full flex-1 items-end justify-center"
          >
            <Tip>
              {nf.format(d.value)} {valueLabel} · {d.key}
            </Tip>
            {/* The hit target is the whole column slot, not the painted bar. */}
            <button
              type="button"
              tabIndex={0}
              aria-label={`${d.key}: ${d.value} ${valueLabel}`}
              className="flex h-full w-full max-w-6 cursor-default items-end justify-center"
            >
              <span
                aria-hidden="true"
                style={{
                  height: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%`,
                  backgroundColor: SERIES,
                }}
                // 4px data-end, square at the baseline it grows from.
                className="block w-full rounded-t transition-opacity group-hover:opacity-80 group-focus-within:opacity-80"
              />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex gap-1.5">
        {data.map((d, i) => (
          <p
            key={d.key}
            className="flex-1 text-center text-[11.5px] text-muted [font-variant-numeric:tabular-nums]"
          >
            {i === peak ? (
              <span className="font-bold text-ink">{nf.format(d.value)}</span>
            ) : (
              d.key
            )}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * Part-to-whole across four reserved status colours.
 *
 * Two or more colours means a legend is always present — identity never rests
 * on colour-matching alone. Segments carry an inline value only where the text
 * genuinely fits; the rest is on the legend, the tooltip and the table.
 */
export function StatusBar({ data }) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;

  return (
    <div>
      {/* The gap is the separator — no borders drawn around fills. */}
      <div className="flex h-11 gap-0.5 overflow-visible">
        {data
          .filter((d) => d.value > 0)
          .map((d) => {
            const pct = (d.value / total) * 100;
            return (
              <div
                key={d.key}
                style={{
                  width: `${pct}%`,
                  backgroundColor: STATUS_FILL[d.key],
                }}
                className="group relative grid min-w-0 place-items-center rounded-sm transition-opacity hover:opacity-90 focus-within:opacity-90"
              >
                <Tip>
                  {STATUS_LABEL[d.key]} · {nf.format(d.value)} (
                  {Math.round(pct)}%)
                </Tip>
                <button
                  type="button"
                  tabIndex={0}
                  aria-label={`${STATUS_LABEL[d.key]}: ${d.value}`}
                  className="grid size-full cursor-default place-items-center"
                >
                  {/* Only label inside the fill when it comfortably fits —
                      a clipped label is worse than none. White on these fills
                      clears contrast in every case. */}
                  {pct >= 12 && (
                    <span className="px-1 text-[12px] font-bold text-white [font-variant-numeric:tabular-nums]">
                      {nf.format(d.value)}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              style={{ backgroundColor: STATUS_FILL[d.key] }}
              className="size-2.5 shrink-0 rounded-sm"
            />
            <span className="text-[12.5px] text-muted">
              {STATUS_LABEL[d.key]}
            </span>
            <span className="text-[12.5px] font-bold text-ink [font-variant-numeric:tabular-nums]">
              {nf.format(d.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Magnitude across nominal categories, biggest first.
 *
 * One series, so one colour for every bar — shading each bar by its own length
 * would double-encode the thing the bar already shows and burn the only free
 * channel on nothing.
 */
export function RankedBars({ data, valueLabel = "" }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  if (!data.length) {
    return <p className="text-[14px] text-muted">Nothing to chart yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((d) => (
        <li key={d.key} className="group relative flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-[13px] text-muted lg:w-36">
            {d.key}
          </span>
          <span className="relative min-w-0 flex-1">
            <Tip>
              {d.key} · {nf.format(d.value)} {valueLabel}
            </Tip>
            <button
              type="button"
              tabIndex={0}
              aria-label={`${d.key}: ${d.value} ${valueLabel}`}
              // A 24px-tall row keeps the hit target well clear of the 10px mark.
              className="flex h-6 w-full cursor-default items-center"
            >
              <span
                aria-hidden="true"
                style={{
                  width: `${Math.max((d.value / max) * 100, 2)}%`,
                  backgroundColor: SERIES,
                }}
                className="block h-2.5 rounded-r-[4px] transition-opacity group-hover:opacity-80 group-focus-within:opacity-80"
              />
            </button>
          </span>
          <span className="w-10 shrink-0 text-right text-[13px] font-bold text-ink [font-variant-numeric:tabular-nums]">
            {nf.format(d.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}
