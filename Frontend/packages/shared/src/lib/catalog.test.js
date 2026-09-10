import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCatalog } from "./catalog.js";

const fallback = {
  categories: [{ id: "fallback", label: "Fallback" }],
  provinces: [{ id: "all", label: "All Canada", areas: [] }],
  popularAreas: ["Fallback Area"],
  locationOptions: [],
  popularAreaOptions: [],
  source: "fallback",
};

test("catalog API data is converted to the existing frontend filter shape", () => {
  const result = normalizeCatalog(
    [{ id: "vehicles", label: "Vehicles" }],
    {
      provinces: [
        {
          id: "on",
          label: "Ontario",
          areas: [{ id: "on-1", label: "Toronto" }],
        },
      ],
      popularAreas: [{ id: "on-1", label: "Toronto" }],
    },
    fallback,
  );

  assert.equal(result.source, "api");
  assert.deepEqual(result.provinces[0], {
    id: "all",
    label: "All Canada",
    areas: [],
  });
  assert.deepEqual(result.provinces[1].areas, ["Toronto"]);
  assert.deepEqual(result.popularAreas, ["Toronto"]);
  assert.equal(result.locationOptions[0].areas[0].id, "on-1");
});

test("invalid or empty category responses keep the offline fallback", () => {
  assert.equal(normalizeCatalog([], {}, fallback), fallback);
  assert.equal(normalizeCatalog(null, null, fallback), fallback);
});

test("partial location responses preserve fallback locations", () => {
  const result = normalizeCatalog(
    [{ id: "personals", label: "Personals" }],
    {},
    fallback,
  );

  assert.equal(result.source, "api");
  assert.equal(result.provinces, fallback.provinces);
  assert.equal(result.popularAreas, fallback.popularAreas);
});
