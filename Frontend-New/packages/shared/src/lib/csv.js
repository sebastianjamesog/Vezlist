/**
 * CSV export, small enough not to be a dependency.
 *
 * The console already holds every row it shows, so an export is a string and a
 * download — no server, no round trip. Which also means it exports exactly what
 * is on screen, filters included, rather than the whole table.
 */

/**
 * One CSV field.
 *
 * Quoting is not optional here: ad titles carry commas and quotes, and a
 * description carries newlines. Anything unquoted would shift every column
 * after it — a spreadsheet that silently reads wrong is worse than no export.
 * A field starting with =, +, - or @ is prefixed with a quote so a spreadsheet
 * treats it as text rather than as a formula.
 */
function field(value) {
  // Every field is quoted, empties included. A row of uniformly quoted fields
  // is one rule to reason about instead of two.
  const text = value === null || value === undefined ? "" : String(value);
  const risky = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${risky.replace(/"/g, '""')}"`;
}

/** `columns` is [{ key, label, value? }] — the same shape the tables use. */
export function toCsv(columns, rows) {
  const head = columns.map((c) => field(c.label ?? c.key)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => field(c.value ? c.value(row) : row[c.key])).join(","),
  );
  // CRLF: Excel is the tool these land in, and it is the one that cares.
  return [head, ...body].join("\r\n");
}

/**
 * Hand the browser a file. Client-only — it touches `document` and `URL`, so
 * call it from an event handler, never during a render.
 */
export function downloadCsv(filename, columns, rows) {
  // The BOM is what makes Excel read it as UTF-8 rather than as Latin-1, which
  // is the difference between "Montréal" and "MontrÃ©al".
  const blob = new Blob(["﻿", toCsv(columns, rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers; a tick is
  // enough for the navigation to have started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
