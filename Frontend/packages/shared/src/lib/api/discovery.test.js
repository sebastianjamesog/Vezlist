import test from "node:test";
import assert from "node:assert/strict";
import { api } from "./client.js";
import { searchListings } from "./discovery.js";

test("ethnicity filters are encoded as a JSON array so custom commas remain part of labels", async (t) => {
  const get = t.mock.method(api, "get", async () => ({ items: [] }));
  await searchListings({
    site: "PERSONALS",
    ethnicities: ["Asian", "Regional, mixed"],
    category: ["one", "two"],
  });
  const [path, query] = get.mock.calls[0].arguments;
  assert.equal(path, "/api/v1/listings");
  assert.equal(query.ethnicities, '["Asian","Regional, mixed"]');
  assert.equal(query.category, "one,two");
  await searchListings({ site: "PERSONALS", ethnicities: [] });
  assert.equal(get.mock.calls[1].arguments[1].ethnicities, undefined);
});
