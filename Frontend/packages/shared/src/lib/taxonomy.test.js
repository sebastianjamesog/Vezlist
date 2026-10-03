// Run with: node --test src/lib/taxonomy.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryById,
  categoryByLabel,
  categoryPath,
  isSubOf,
  subsFor,
  subsForId,
  setCategories,
} from "./taxonomy.js";
import { categories, listings } from "../data/mock.js";

setCategories(categories);

test("every category carries its own sub-categories", () => {
  for (const c of categories) {
    assert.ok(Array.isArray(c.subs) && c.subs.length >= 3, c.id);
    // Duplicates inside one category would make two pills that filter the
    // same ads and clear each other.
    assert.equal(new Set(c.subs).size, c.subs.length, `${c.id} has duplicates`);
  }
});

test("lookups answer by id and by label, and miss quietly", () => {
  assert.equal(categoryById("vehicles").label, "Vehicles");
  assert.equal(categoryByLabel("Vehicles").id, "vehicles");
  assert.equal(categoryById("nope"), null);
  assert.equal(categoryByLabel("Nope"), null);
});

test("subsFor never returns null, so no caller has to guard it", () => {
  assert.ok(subsFor("Vehicles").includes("Motorcycles"));
  assert.deepEqual(subsFor("Not a category"), []);
  assert.deepEqual(subsFor(undefined), []);
  assert.deepEqual(subsForId("vehicles"), subsFor("Vehicles"));
  assert.deepEqual(subsForId("nope"), []);
});

test("an absent sub-category is valid — that is what optional means", () => {
  assert.equal(isSubOf("Vehicles", null), true);
  assert.equal(isSubOf("Vehicles", undefined), true);
  assert.equal(isSubOf("Vehicles", ""), true);
});

test("a sub-category from the wrong category is rejected", () => {
  assert.equal(isSubOf("Vehicles", "Motorcycles"), true);
  // Real sub-category, wrong parent — the case a hand-edited ?sub= produces.
  assert.equal(isSubOf("Property", "Motorcycles"), false);
  assert.equal(isSubOf("Vehicles", "Nonsense"), false);
});

test("categoryPath degrades to the category when there is no sub", () => {
  assert.equal(categoryPath("Vehicles", "Boats"), "Vehicles › Boats");
  assert.equal(categoryPath("Vehicles", null), "Vehicles");
  assert.equal(categoryPath("Vehicles", ""), "Vehicles");
  // Nothing to say rather than a stray separator.
  assert.equal(categoryPath(null, "Boats"), "");
});

test("seeded listings are consistent with the tree they claim to be in", () => {
  for (const l of listings) {
    assert.equal(
      isSubOf(l.category, l.subcategory),
      true,
      `${l.title}: ${l.subcategory} is not under ${l.category}`,
    );
  }
});

test("some listings have no sub-category, so screens meet the empty case", () => {
  const bare = listings.filter((l) => l.subcategory == null);
  assert.ok(bare.length > 0, "every listing was classified — no empty case");
  assert.ok(
    bare.length < listings.length,
    "no listing was classified — nothing to filter",
  );
});
