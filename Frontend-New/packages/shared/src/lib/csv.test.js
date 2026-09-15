import test from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "./csv.js";

const columns = [
  { key: "title", label: "Ad" },
  { key: "price", label: "Price" },
  { key: "views", label: "Views", value: (r) => r.views ?? 0 },
];

test("a header row and one row per record", () => {
  const csv = toCsv(columns, [
    { title: "Bike", price: 200, views: 12 },
    { title: "Desk", price: 80, views: 3 },
  ]);
  assert.deepEqual(csv.split("\r\n"), [
    '"Ad","Price","Views"',
    '"Bike","200","12"',
    '"Desk","80","3"',
  ]);
});

test("commas, quotes and newlines survive the trip", () => {
  // These are all real shapes in the listing data — a title with a comma is
  // the common case, and unquoted it shifts every column after it.
  const csv = toCsv(columns, [
    { title: 'Sony A7 III, 28-70mm "kit"', price: 1450, views: 4 },
    { title: "Two\nlines", price: 0, views: 0 },
  ]);
  assert.ok(csv.includes('"Sony A7 III, 28-70mm ""kit"""'));
  assert.ok(csv.includes('"Two\nlines"'));
});

test("a value that looks like a formula is neutralised", () => {
  const csv = toCsv(
    [{ key: "note", label: "Note" }],
    [
      { note: "=1+1" },
      { note: "+15551234" },
      { note: "-5" },
      { note: "@handle" },
    ],
  );
  for (const line of csv.split("\r\n").slice(1)) {
    assert.ok(line.startsWith(`"'`), line);
  }
});

test("missing values become empty, not the word undefined", () => {
  const csv = toCsv(columns, [{ title: "Only a title" }]);
  assert.equal(csv.split("\r\n")[1], '"Only a title","","0"');
});

test("no rows still yields a usable header", () => {
  assert.equal(toCsv(columns, []), '"Ad","Price","Views"');
});
