// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  EMPTY_DRAFT,
  STEPS,
  draftFromListing,
  isDraftWorthSaving,
  isPersonalsCategory,
  normaliseDraft,
  reorderImages,
  stepIndex,
  toListingWriteRequest,
  validateStep,
} from "./adDraft.js";
import { ethnicities } from "../data/mock.js";

const draft = (over) => ({ ...EMPTY_DRAFT, ...over });
const good = draft({
  images: ["a.jpg"],
  title: "2 Bedroom Apartment",
  business: "Modern City Apartments",
  category: "Property",
  categoryId: "property",
  description: "Bright two bedroom with parking, available from next month.",
  location: "Victoria, BC",
  locationId: "bc-victoria",
  provinceId: "bc",
  email: "seller@example.com",
  phone: "+1 250 555 1234",
});

test("every step of a complete draft passes", () => {
  for (const s of STEPS) assert.deepEqual(validateStep(s.id, good), {});
});

test("photos step needs at least one and at most six", () => {
  assert.equal(
    validateStep("photos", draft({ images: [] })).images,
    "Add at least one photo.",
  );
  assert.deepEqual(
    validateStep("photos", draft({ images: Array(6).fill("x") })),
    {},
  );
  assert.match(
    validateStep("photos", draft({ images: Array(7).fill("x") })).images,
    /at most 6/,
  );
});

test("details step checks title, business, category and description length", () => {
  const e = validateStep(
    "details",
    draft({ ...good, title: "abc", description: "too short" }),
  );
  assert.ok(e.title);
  assert.ok(e.description);
  assert.equal(e.business, undefined);

  assert.ok(validateStep("details", draft({ ...good, category: "" })).category);
  assert.ok(
    validateStep("details", draft({ ...good, business: "   " })).business,
  );
});

test("legacy subcategory attributes are preserved without mock taxonomy validation", () => {
  const legacy = { ...good, subcategory: "A retired subcategory" };
  assert.deepEqual(validateStep("details", legacy), {});
  assert.equal(
    toListingWriteRequest(legacy, { site: "MARKETPLACE" }).attributes.subcategory,
    "A retired subcategory",
  );
});

test("details require an exact category selection, not a label alone", () => {
  for (const selection of [
    { categoryId: "" },
    { categoryId: undefined },
    { categoryId: "   " },
    { categoryId: 42 },
    { category: "" },
  ]) {
    assert.equal(
      validateStep("details", { ...good, ...selection }).category,
      "Select a category from the list.",
    );
  }
});

test("a draft written before sub-categories existed still validates", () => {
  // Nothing persists the draft today, so this is about the next build that
  // does: a restored object simply has no `subcategory` key, and reading one
  // that isn't there must be the valid-and-absent case, not a crash.
  const older = { ...good };
  delete older.subcategory;
  assert.deepEqual(validateStep("details", older), {});
});

test("price is optional but must be a positive number when given", () => {
  assert.equal(
    validateStep("details", draft({ ...good, price: "" })).price,
    undefined,
  );
  assert.equal(
    validateStep("details", draft({ ...good, price: "0" })).price,
    undefined,
  );
  assert.ok(validateStep("details", draft({ ...good, price: "-5" })).price);
  assert.ok(validateStep("details", draft({ ...good, price: "abc" })).price);
});

test("contact step validates email shape and phone digit count", () => {
  assert.ok(validateStep("contact", draft({ ...good, email: "nope" })).email);
  assert.ok(validateStep("contact", draft({ ...good, email: "a@b" })).email);
  assert.equal(
    validateStep("contact", draft({ ...good, email: "a@b.co" })).email,
    undefined,
  );

  assert.ok(validateStep("contact", draft({ ...good, phone: "12345" })).phone);
  assert.ok(
    validateStep("contact", draft({ ...good, phone: "1".repeat(16) })).phone,
  );
  assert.equal(
    validateStep("contact", draft({ ...good, phone: "(250) 555-1234" })).phone,
    undefined,
  );
});

test("contact requires a selected location, not just a typed or legacy label", () => {
  for (const selection of [
    { locationId: "", provinceId: "" },
    { locationId: undefined, provinceId: undefined },
    { locationId: "bc-victoria", provinceId: "" },
    { locationId: "   ", provinceId: "bc" },
    { locationId: 42, provinceId: "bc" },
    { location: "", locationId: "bc-victoria", provinceId: "bc" },
  ]) {
    assert.equal(
      validateStep("contact", { ...good, ...selection }).location,
      "Select a location from the suggestions.",
    );
  }
});

test("editing and mapping places with duplicate labels preserves each exact ID", () => {
  for (const [locationId, provinceId] of [["bc-richmond", "bc"], ["on-richmond", "on"]]) {
    const edited = draftFromListing({
      locationLabel: "Richmond",
      locationId,
      provinceId,
    });
    assert.equal(edited.location, "Richmond");
    assert.equal(edited.locationId, locationId);
    assert.equal(edited.provinceId, provinceId);
    const request = toListingWriteRequest(edited, {
      site: "MARKETPLACE",
    });
    assert.equal(request.locationId, locationId);
    assert.equal(request.provinceId, provinceId);
  }
});

test("a step only reports its own fields", () => {
  const empty = draft({});
  assert.deepEqual(Object.keys(validateStep("photos", empty)), ["images"]);
  assert.deepEqual(Object.keys(validateStep("contact", empty)).sort(), [
    "email",
    "location",
    "phone",
  ]);
});

test("review never blocks", () => {
  assert.deepEqual(validateStep("review", draft({})), {});
});

// Marketplace retains its Dating compatibility; Personals uses its site scope.
const person = draft({ ...good, category: "Dating", categoryId: "dating", subcategory: "" });

test("a personals draft with none of the extra fields filled in still passes", () => {
  // The whole stance: eight optional questions, and answering none of them is
  // not a failure state.
  assert.deepEqual(validateStep("details", person), {});
});

test("age is optional, but must be a whole 18-plus number when given", () => {
  assert.equal(
    validateStep("details", draft({ ...person, age: "" })).age,
    undefined,
  );
  assert.equal(
    validateStep("details", draft({ ...person, age: "18" })).age,
    undefined,
  );
  assert.equal(
    validateStep("details", draft({ ...person, age: "45" })).age,
    undefined,
  );
  // Under the board's own 18+ line.
  assert.ok(validateStep("details", draft({ ...person, age: "17" })).age);
  assert.ok(validateStep("details", draft({ ...person, age: "0" })).age);
  // Not a whole number, and not a number at all.
  assert.ok(validateStep("details", draft({ ...person, age: "22.5" })).age);
  assert.ok(validateStep("details", draft({ ...person, age: "twenty" })).age);
  assert.ok(validateStep("details", draft({ ...person, age: "120" })).age);
});

test("weight is optional, but needs a number in it when given", () => {
  for (const w of ["", "54", "54 kg", "54kg", "120 lbs", "68.5 kg"])
    assert.equal(
      validateStep("details", draft({ ...person, weight: w })).weight,
      undefined,
      w,
    );
  // Answers to a different question: real words, but nothing to sort on.
  for (const w of ["slim", "average", "kg", "-60"])
    assert.ok(
      validateStep("details", draft({ ...person, weight: w })).weight,
      w,
    );
});

test("ethnicity is optional, but must be one of the offered values", () => {
  assert.equal(
    validateStep("details", draft({ ...person, ethnicity: "" })).ethnicity,
    undefined,
  );
  assert.equal(
    validateStep("details", draft({ ...person, ethnicity: ethnicities[0] }))
      .ethnicity,
    undefined,
  );
  // Only reachable from a draft that outlived a rename — the pills cannot
  // produce it — which is exactly why it is checked rather than trusted.
  assert.ok(
    validateStep("details", draft({ ...person, ethnicity: "Martian" }))
      .ethnicity,
  );
});

test("the personals group is not checked outside a personals category", () => {
  // `good` is a Property ad. The fields are never rendered for it, so an error
  // on one of them would be an error the poster cannot see, let alone fix.
  assert.deepEqual(
    validateStep(
      "details",
      draft({ ...good, age: "4", weight: "heavy", ethnicity: "Martian" }),
    ),
    {},
  );
});

test("the free-text personals fields are never validated", () => {
  assert.deepEqual(
    validateStep(
      "details",
      draft({
        ...person,
        height: "as tall as a door",
        bodyStats: "?",
        hairColour: "whatever",
        eyeColour: "two",
        availability: "Incall & Outcall",
      }),
    ),
    {},
  );
});

test("a draft written before the personals group existed still validates", () => {
  // Same case as the missing sub-category above: the keys are simply absent,
  // and every read of them has to be the valid-and-absent one rather than a
  // crash on `undefined.trim`.
  const older = { ...person };
  for (const k of ["age", "weight", "ethnicity", "height", "availability"])
    delete older[k];
  assert.deepEqual(validateStep("details", older), {});
});

test("Marketplace only retains the Dating category's personal fields", () => {
  assert.equal(isPersonalsCategory("Dating"), true);
  assert.equal(isPersonalsCategory("A new marketplace category"), false);
  assert.equal(isPersonalsCategory("Vehicles"), false);
  assert.equal(isPersonalsCategory(""), false);
  assert.equal(isPersonalsCategory(undefined), false);
});

test("dynamic Personals categories share personal-field validation and payload mapping", () => {
  const moduleUrl = new URL("./adDraft.js", import.meta.url).href;
  const script = `
    import assert from "node:assert/strict";
    import { isPersonalsCategory, validateStep, toListingWriteRequest } from ${JSON.stringify(moduleUrl)};
    const draft = ${JSON.stringify({ ...good, category: "New community", categoryId: "new-community", age: "27", weight: "60 kg" })};
    assert.equal(isPersonalsCategory(draft.category), true);
    assert.equal(isPersonalsCategory(""), true);
    assert.deepEqual(validateStep("details", draft), {});
    assert.ok(validateStep("details", { ...draft, age: "17" }).age);
    const request = toListingWriteRequest(draft, { site: "PERSONALS" });
    assert.equal(request.categoryId, "new-community");
    assert.equal(request.attributes.age, "27");
    assert.equal(request.attributes.weight, "60 kg");
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    encoding: "utf8",
    env: { ...process.env, NEXT_PUBLIC_SITE: "personals" },
  });
  assert.equal(result.status, 0, result.stderr);
});

test("stepIndex tracks order and reports -1 for unknown ids", () => {
  assert.equal(stepIndex("photos"), 0);
  assert.equal(stepIndex("review"), STEPS.length - 1);
  assert.equal(stepIndex("nope"), -1);
});

/* ---------------------------------------------------------- reorderImages */

const imgs = (...ids) => ids.map((id) => ({ id, name: id, url: id }));

test("moving a photo to the front makes it the cover, the rest keeping their order", () => {
  const next = reorderImages(imgs("a", "b", "c", "d"), 2, 0);
  assert.deepEqual(
    next.map((i) => i.id),
    ["c", "a", "b", "d"],
  );
});

test("moving a photo one place later swaps it past its neighbour", () => {
  const next = reorderImages(imgs("a", "b", "c"), 0, 1);
  assert.deepEqual(
    next.map((i) => i.id),
    ["b", "a", "c"],
  );
});

test("a target past the end clamps to the last position rather than dropping the photo", () => {
  const next = reorderImages(imgs("a", "b", "c"), 0, 99);
  assert.deepEqual(
    next.map((i) => i.id),
    ["b", "c", "a"],
  );
});

test("moving a photo to the position it's already in changes nothing, same array back", () => {
  const list = imgs("a", "b", "c");
  assert.equal(reorderImages(list, 1, 1), list);
});

test("an out-of-range source index is refused, same array back", () => {
  const list = imgs("a", "b");
  assert.equal(reorderImages(list, 5, 0), list);
  assert.equal(reorderImages(list, -1, 0), list);
});

test("reordering never mutates the array it was handed", () => {
  const list = imgs("a", "b", "c");
  const copy = list.map((i) => ({ ...i }));
  reorderImages(list, 2, 0);
  assert.deepEqual(list, copy);
});

/* ------------------------------------------------------- isDraftWorthSaving */

test("a fresh draft has no preselected category and is not worth saving", () => {
  assert.equal(EMPTY_DRAFT.category, "");
  assert.equal(EMPTY_DRAFT.categoryId, "");
  assert.equal(isDraftWorthSaving({ ...EMPTY_DRAFT }), false);
});

test("a single photo is enough to be worth saving", () => {
  assert.equal(
    isDraftWorthSaving({ ...EMPTY_DRAFT, images: [{ id: "a", url: "a" }] }),
    true,
  );
});

test("a single typed field, other than category, is enough to be worth saving", () => {
  assert.equal(isDraftWorthSaving({ ...EMPTY_DRAFT, title: "T" }), true);
});

test("an intentional category selection is worth restoring", () => {
  assert.equal(
    isDraftWorthSaving({ ...EMPTY_DRAFT, category: "Vehicles", categoryId: "vehicles" }),
    true,
  );
});

/* -------------------------------------------------------------- normaliseDraft */

test("a well-formed stored draft comes back whole", () => {
  const stored = {
    images: [
      { id: "img-0", name: "beach.jpg", url: "data:image/jpeg;base64,AAA" },
    ],
    title: "Kayak, barely used",
    business: "Jane",
    category: "Property",
    categoryId: "property",
    subcategory: "",
    price: "150",
    description: "Great condition, used twice.",
    location: "Victoria, BC",
    email: "jane@example.com",
    phone: "250 555 1234",
  };
  const draft = normaliseDraft(stored);
  assert.equal(draft.title, "Kayak, barely used");
  assert.equal(draft.price, "150");
  assert.deepEqual(draft.images, [
    { id: "img-0", name: "beach.jpg", url: "data:image/jpeg;base64,AAA" },
  ]);
});

test("anything that isn't an object is nothing worth restoring", () => {
  assert.equal(normaliseDraft(null), null);
  assert.equal(normaliseDraft(undefined), null);
  assert.equal(normaliseDraft("a draft"), null);
  assert.equal(normaliseDraft(["not", "a", "draft"]), null);
  assert.equal(normaliseDraft(5), null);
});

test("selected location IDs survive draft persistence without matching labels again", () => {
  const restored = normaliseDraft(JSON.parse(JSON.stringify(good)));
  assert.equal(restored.locationId, "bc-victoria");
  assert.equal(restored.provinceId, "bc");
  assert.deepEqual(validateStep("contact", restored), {});
});

test("legacy saved location labels require reselection but keep the rest of the draft", () => {
  const legacy = { ...good };
  delete legacy.locationId;
  delete legacy.provinceId;
  const restored = normaliseDraft(legacy);
  assert.equal(restored.location, good.location);
  assert.equal(restored.title, good.title);
  assert.equal(restored.locationId, "");
  assert.equal(restored.provinceId, "");
  assert.equal(
    validateStep("contact", restored).location,
    "Select a location from the suggestions.",
  );
});

test("a missing images array is treated as none, not a crash", () => {
  const draft = normaliseDraft({ title: "T" });
  assert.deepEqual(draft.images, []);
});

test("an image missing an id or a url is dropped rather than carried in broken", () => {
  const draft = normaliseDraft({
    images: [
      { id: "a", url: "data:x" },
      { id: "b" },
      { url: "data:y" },
      "not an object",
      { id: "", url: "data:z" },
    ],
  });
  assert.deepEqual(
    draft.images.map((i) => i.id),
    ["a"],
  );
});

test("an image with no name falls back to a positional one", () => {
  const draft = normaliseDraft({ images: [{ id: "a", url: "data:x" }] });
  assert.equal(draft.images[0].name, "Photo 1");
});

test("more photos than MAX_IMAGES are clamped, not spilled into a broken step", () => {
  const images = Array.from({ length: 9 }, (_, i) => ({
    id: `img-${i}`,
    url: `data:${i}`,
  }));
  const draft = normaliseDraft({ images });
  assert.equal(draft.images.length, 6);
});

test("a non-string field is dropped to EMPTY_DRAFT's default rather than crashing a screen", () => {
  const draft = normaliseDraft({ title: 5, business: null, price: ["150"] });
  assert.equal(draft.title, "");
  assert.equal(draft.business, "");
  assert.equal(draft.price, "");
});

test("a legacy category label is retained and requires reselection, never a default", () => {
  const draft = normaliseDraft({
    ...good,
    category: "A category from a long-gone build",
    categoryId: undefined,
  });
  assert.equal(draft.category, "A category from a long-gone build");
  assert.equal(draft.categoryId, "");
  assert.equal(validateStep("details", draft).category, "Select a category from the list.");
});

test("dynamic categories persist and edit using exact IDs even when labels match", () => {
  for (const categoryId of ["new-category-one", "new-category-two"]) {
    const stored = normaliseDraft({ ...good, category: "Custom category", categoryId });
    assert.equal(stored.category, "Custom category");
    assert.equal(stored.categoryId, categoryId);
    assert.deepEqual(validateStep("details", stored), {});
    const edited = draftFromListing({ categoryLabel: "Custom category", categoryId });
    assert.equal(edited.category, "Custom category");
    assert.equal(edited.categoryId, categoryId);
    assert.equal(toListingWriteRequest(edited, { site: "MARKETPLACE" }).categoryId, categoryId);
  }
});

test("an unrecognised top-level key is simply not carried over", () => {
  const draft = normaliseDraft({
    title: "T",
    futureField: "from a later build",
  });
  assert.equal(draft.futureField, undefined);
  assert.equal(draft.title, "T");
});
