// Run with: node --test src/lib/accountRoles.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_ROLES,
  ACCOUNT_ROLE_LIST,
  CAPABILITIES,
  DEFAULT_ROLE,
  SIGNUP_ROLE,
  can,
  isCreatorRole,
  normaliseRole,
} from "./accountRoles.js";

test("the two public roles are the two the screens branch on", () => {
  assert.deepEqual(
    ACCOUNT_ROLE_LIST.map((r) => r.id),
    ["user", "creator"],
  );
  // Every role carries what the switch screens render, so no screen has to
  // hardcode a label for a role the table already describes.
  for (const role of ACCOUNT_ROLE_LIST) {
    assert.ok(role.label && role.blurb && role.icon, role.id);
  }
});

test("a browsing account can use the board but cannot put anything on it", () => {
  assert.equal(can("user", "listing.save"), true);
  assert.equal(can("user", "wallet.view"), true);

  assert.equal(can("user", "ad.create"), false);
  assert.equal(can("user", "ad.manage"), false);
  assert.equal(can("user", "ad.promote"), false);
  assert.equal(can("user", "dashboard.view"), false);
  assert.equal(can("user", "wallet.spend"), false);
});

test("a creator holds everything a browsing account holds, and more", () => {
  for (const capability of Object.keys(CAPABILITIES)) {
    if (can("user", capability)) {
      assert.equal(can("creator", capability), true, capability);
    }
  }
  assert.equal(can("creator", "ad.create"), true);
  assert.equal(can("creator", "wallet.spend"), true);
});

test("an unknown capability is denied — a typo must not open a screen", () => {
  assert.equal(can("creator", "ad.destroy"), false);
  assert.equal(can("creator", ""), false);
  assert.equal(can("creator", undefined), false);
});

test("an unknown role is denied everything a creator holds", () => {
  assert.equal(can("owner", "ad.create"), false);
  assert.equal(can(undefined, "listing.save"), false);
});

test("a stored role from another build falls back rather than breaking", () => {
  assert.equal(normaliseRole("creator"), "creator");
  assert.equal(normaliseRole("seller"), DEFAULT_ROLE);
  assert.equal(normaliseRole(undefined), DEFAULT_ROLE);
  assert.equal(normaliseRole(null), DEFAULT_ROLE);
  assert.equal(DEFAULT_ROLE, "user");
  assert.ok(ACCOUNT_ROLES[DEFAULT_ROLE]);
});

test("isCreatorRole normalises before it answers", () => {
  assert.equal(isCreatorRole("creator"), true);
  assert.equal(isCreatorRole("user"), false);
  assert.equal(isCreatorRole("nonsense"), false);
});

test("signing up makes a creator; a guest is what browsing means", () => {
  // The signup form does not ask. An account exists to put something on the
  // board — browsing needs no account, so it cannot be what one grants.
  assert.equal(SIGNUP_ROLE, "creator");
  assert.equal(can(SIGNUP_ROLE, "ad.create"), true);
  assert.equal(can(SIGNUP_ROLE, "dashboard.view"), true);

  // Browsing survives as the signed-out state and as a downgrade in Settings.
  assert.equal(DEFAULT_ROLE, "user");
  assert.notEqual(SIGNUP_ROLE, DEFAULT_ROLE);
  assert.ok(ACCOUNT_ROLES[SIGNUP_ROLE]);
});
