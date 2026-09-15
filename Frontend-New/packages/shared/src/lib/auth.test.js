import test from "node:test";
import assert from "node:assert/strict";
import { validateAuth } from "./auth.js";

const good = {
  name: "Sarah Jenkins",
  email: "sarah@example.com",
  password: "hunter2hunter2",
  accepted: true,
};

test("a complete form passes in both modes", () => {
  assert.deepEqual(validateAuth(good, "signin"), {});
  assert.deepEqual(validateAuth(good, "signup"), {});
});

test("sign in ignores name and terms", () => {
  assert.deepEqual(
    validateAuth({ ...good, name: "", accepted: false }, "signin"),
    {},
  );
});

test("sign up requires name and terms", () => {
  const e = validateAuth({ ...good, name: "", accepted: false }, "signup");
  assert.ok(e.name);
  assert.ok(e.accepted);
});

test("email must look like an email", () => {
  assert.ok(validateAuth({ ...good, email: "nope" }, "signin").email);
  assert.ok(validateAuth({ ...good, email: "a@b" }, "signin").email);
});

test("password has a floor of 8 characters", () => {
  assert.ok(validateAuth({ ...good, password: "short" }, "signin").password);
});

test("the validator has no opinion about account type", () => {
  // Signing up always makes an ads creator and the form never asks, so a role
  // on the payload is something the caller decided, not something to check.
  assert.deepEqual(validateAuth({ ...good, role: "creator" }, "signup"), {});
  assert.deepEqual(validateAuth({ ...good, role: "nonsense" }, "signup"), {});
});
