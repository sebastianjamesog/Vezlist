import test from "node:test";
import assert from "node:assert/strict";
import { fileSha256 } from "./media.js";

test("fileSha256 returns a lowercase SHA-256 checksum", async () => {
  const file = new Blob(["vezlist"]);
  assert.equal(
    await fileSha256(file),
    "6f10c2d75ecd7edfb4ec826f49aa265a0aeae6eba0f719d8827373e729598775",
  );
});
