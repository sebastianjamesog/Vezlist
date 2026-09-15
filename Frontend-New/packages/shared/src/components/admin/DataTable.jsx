"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import EmptyState from "../ui/EmptyState";

/**
 * One table for all thirteen sections.
 *
 * `columns` is the whole configuration: what to show, how to sort it, how wide
 * it is, and whether it survives a phone. Sorting and paging are internal
 * because no screen has ever needed to read them; selection is lifted, because
 * the bulk-action bar that acts on it lives outside the table.
 *
 * Not a table library. Thirteen sections of one product is not thirteen kinds
 * of table, and the one thing a library would add here — virtualisation — is
 * not needed by a client-side slice of twenty-five rows.
 */

const PAGE_SIZE = 25;

/** What a column sorts on, when it isn't just the raw field. */
const sortValue = (row, column) => {
  const raw = column.value ? column.value(row) : row[column.key];
  return typeof raw === "string" ? raw.toLowerCase() : raw;
};

export default function DataTable({
  columns,
  rows,
  rowKey = (row) => row.id,
  onRowClick,
  selectable = false,
  selected = [],
  onSelectedChange,
  empty,
  pageSize = PAGE_SIZE,
  initialSort,
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    // Copy first: a sort in place would mutate the caller's array, and the
    // caller's array is usually a `useMemo` the screen is still holding.
    return [...rows].sort((a, b) => {
      const av = sortValue(a, column);
      const bv = sortValue(b, column);
      if (av === bv) return 0;
      // Undefined sinks either way, so a missing field never sorts to the top.
      if (av == null) return 1;
      if (bv == null) return -1;
      return av > bv ? dir : -dir;
    });
  }, [rows, sort, columns]);

  // A filter that shortens the list can leave `page` past the end. Clamp on
  // read rather than resetting in an effect, which would render the empty page
  // once before correcting it.
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const slice = sorted.slice(current * pageSize, (current + 1) * pageSize);

  const sliceKeys = slice.map(rowKey);
  const allOnPage =
    sliceKeys.length > 0 && sliceKeys.every((k) => selected.includes(k));

  function toggleSort(column) {
    if (column.sortable === false) return;
    setPage(0);
    setSort((s) =>
      s?.key === column.key
        ? { key: column.key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key: column.key, dir: "asc" },
    );
  }

  function toggleAll() {
    if (!onSelectedChange) return;
    onSelectedChange(
      allOnPage
        ? selected.filter((k) => !sliceKeys.includes(k))
        : [...new Set([...selected, ...sliceKeys])],
    );
  }

  function toggleOne(key) {
    if (!onSelectedChange) return;
    onSelectedChange(
      selected.includes(key)
        ? selected.filter((k) => k !== key)
        : [...selected, key],
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon={empty?.icon ?? "Inbox"}
        title={empty?.title ?? "Nothing here"}
        body={empty?.body}
        action={empty?.action}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card">
      {/* Wide tables scroll inside their own card rather than pushing the page
          sideways — a console has columns a phone will never fit. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              {selectable && (
                <th scope="col" className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allOnPage}
                    onChange={toggleAll}
                    aria-label="Select every row on this page"
                    className="size-4 accent-[var(--brand)]"
                  />
                </th>
              )}
              {columns.map((column) => {
                const active = sort?.key === column.key;
                const Arrow =
                  active && sort.dir === "desc" ? ChevronDown : ChevronUp;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      active
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={`px-4 py-3 text-[12px] font-bold uppercase tracking-wide text-muted ${column.className ?? ""}`}
                    style={column.width ? { width: column.width } : undefined}
                  >
                    {column.sortable === false ? (
                      column.label
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="inline-flex items-center gap-1 hover:text-ink"
                      >
                        {column.label}
                        <Arrow
                          className={`size-3.5 transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
                          strokeWidth={3}
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {slice.map((row) => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (
                            event.currentTarget === event.target &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={
                    onRowClick
                      ? `Open ${column0Label(columns, row)}`
                      : undefined
                  }
                  className={`border-b border-line last:border-0 ${
                    onRowClick
                      ? "cursor-pointer hover:bg-canvas focus-visible:bg-brand-soft"
                      : ""
                  } ${selected.includes(key) ? "bg-brand-soft" : ""}`}
                >
                  {selectable && (
                    <td
                      className="px-4 py-3"
                      // The checkbox is inside a row that navigates; without
                      // this, ticking one opens the detail screen instead.
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(key)}
                        onChange={() => toggleOne(key)}
                        aria-label={`Select ${column0Label(columns, row)}`}
                        className="size-4 accent-[var(--brand)]"
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3 align-middle text-[14px] text-ink ${column.className ?? ""}`}
                    >
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="text-[13px] font-medium text-muted">
            {current * pageSize + 1}–
            {Math.min((current + 1) * pageSize, sorted.length)} of{" "}
            {sorted.length}
          </p>
          <div className="flex gap-2">
            <PageButton
              label="Previous page"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft className="size-4" strokeWidth={2.6} />
            </PageButton>
            <PageButton
              label="Next page"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight className="size-4" strokeWidth={2.6} />
            </PageButton>
          </div>
        </div>
      )}
    </div>
  );
}

/** The first column's text, so a row checkbox has a name and not just a box. */
function column0Label(columns, row) {
  const first = columns[0];
  const raw = first.value ? first.value(row) : row[first.key];
  return typeof raw === "string" ? raw : "this row";
}

function PageButton({ label, disabled, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-8 place-items-center rounded-lg border border-line text-ink transition-colors hover:bg-canvas disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}
