// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_DRAFT, STEPS, stepIndex, validateStep } from "./adDraft.js";

const draft = (over) => ({ ...EMPTY_DRAFT, ...over });
const good = draft({
  images: ["a.jpg"],
  title: "2 Bedroom Apartment",
  business: "Modern City Apartments",
  category: "Property",
  description: "Bright two bedroom with parking, available from next month.",
  location: "Victoria, BC",
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

test("stepIndex tracks order and reports -1 for unknown ids", () => {
  assert.equal(stepIndex("photos"), 0);
  assert.equal(stepIndex("review"), STEPS.length - 1);
  assert.equal(stepIndex("nope"), -1);
});
