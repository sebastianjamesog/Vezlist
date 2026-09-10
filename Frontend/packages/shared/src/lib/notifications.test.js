import test from "node:test";
import assert from "node:assert/strict";
import {
  createNotificationsQuery,
  notificationCount,
  notificationPage,
  notificationsPath,
} from "./notifications.js";

const id = "7b8c4190-4ce1-4327-8758-3265c0ab95cc";
const secondId = "8b8c4190-4ce1-4327-8758-3265c0ab95cc";
const item = {
  id,
  type: "LISTING_APPROVED",
  title: "Ad approved",
  message: "Your ad is live.",
  href: "/profile/ads",
  createdAt: "2026-09-01T12:00:00Z",
  readAt: null,
};
const page = (items = [item], nextCursor = null) => ({ items, nextCursor });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test("notification paths enforce site and positive decimal cursors", () => {
  assert.equal(
    notificationsPath("personals", "15"),
    "/me/notifications?site=PERSONALS&limit=24&cursor=15",
  );
  for (const cursor of ["0", "-1", "1&site=OTHER", 1, "1.5"])
    assert.throws(() => notificationsPath("marketplace", cursor));
  assert.throws(() => notificationsPath("other"));
});

test("notification contract rejects malformed data and unsafe navigation", () => {
  assert.deepEqual(notificationPage(page()), page());
  for (const href of [
    "//evil.test",
    "javascript:alert(1)",
    "/\\evil.test",
    "/%2f%2fevil.test",
    "/profile/../admin",
    "https://evil.test",
  ]) {
    assert.throws(() => notificationPage(page([{ ...item, href }])));
  }
  for (const patch of [
    { id: "bad" },
    { type: "UNKNOWN" },
    { createdAt: "yesterday" },
    { readAt: false },
    { title: "" },
  ]) {
    assert.throws(() => notificationPage(page([{ ...item, ...patch }])));
  }
  assert.throws(() => notificationPage(page([item, item])));
  assert.throws(() => notificationPage({ items: [] }));
  for (const count of [-1, 1.5, "1", NaN])
    assert.throws(() => notificationCount({ count }));
});

test("guest cache never requests notification data or mutations", async () => {
  let calls = 0;
  const query = createNotificationsQuery(
    () => {
      calls += 1;
    },
    "marketplace",
    false,
  );
  await Promise.all([
    query.load(),
    query.count(),
    query.markRead(),
    query.refresh(),
  ]);
  assert.equal(calls, 0);
  assert.equal(query.getSnapshot().count, null);
});

test("cache deduplicates requests and merges keyset pages", async () => {
  const paths = [];
  const query = createNotificationsQuery(async (path) => {
    paths.push(path);
    return path.includes("cursor=")
      ? page([item, { ...item, id: secondId }])
      : page([item], "12");
  }, "marketplace");
  await Promise.all([query.load(), query.load()]);
  assert.equal(paths.length, 1);
  await query.load(true);
  assert.equal(query.getSnapshot().items.length, 2);
  assert.match(paths[1], /cursor=12$/);
});

test("failed fetch exposes retry state and never fixtures", async () => {
  let fail = true;
  const query = createNotificationsQuery(async () => {
    if (fail) throw new Error("Offline");
    return page([]);
  }, "personals");
  await query.load();
  assert.equal(query.getSnapshot().error.message, "Offline");
  assert.equal(query.getSnapshot().items.length, 0);
  fail = false;
  await query.load();
  assert.equal(query.getSnapshot().loaded, true);
  assert.equal(query.getSnapshot().error, null);
});

test("confirmed mark-one and mark-all are scoped POSTs and revalidate", async () => {
  let readAt = null;
  const writes = [];
  const query = createNotificationsQuery(async (path, options) => {
    if (options) {
      writes.push({ path, options });
      readAt = "2026-09-01T13:00:00Z";
      return { count: 0 };
    }
    return path.includes("unread-count")
      ? { count: readAt ? 0 : 1 }
      : page([{ ...item, readAt }]);
  }, "personals");
  await query.load();
  await query.markRead(id);
  assert.equal(writes[0].path, `/me/notifications/${id}/read?site=PERSONALS`);
  assert.deepEqual(writes[0].options, { method: "POST" });
  assert.equal(query.getSnapshot().count, 0);
  assert.equal(query.getSnapshot().items[0].readAt, readAt);
  await query.markRead();
  assert.equal(writes[1].path, "/me/notifications/read-all?site=PERSONALS");
});

test("failed mutation preserves unread state and exposes actionable error", async () => {
  const query = createNotificationsQuery(async (path, options) => {
    if (options) throw new Error("Try later");
    return path.includes("unread-count") ? { count: 1 } : page();
  }, "marketplace");
  await query.load();
  await query.markRead(id);
  assert.equal(query.getSnapshot().items[0].readAt, null);
  assert.equal(query.getSnapshot().mutationError.message, "Try later");
  assert.equal(query.getSnapshot().pending, null);
});

test("disposed session ignores a late response and cannot send actions", async () => {
  const pending = deferred();
  let calls = 0;
  const query = createNotificationsQuery(() => {
    calls += 1;
    return pending.promise;
  }, "marketplace");
  const loading = query.load();
  await Promise.resolve();
  query.dispose();
  pending.resolve(page());
  await loading;
  await query.markRead();
  assert.equal(query.getSnapshot().items.length, 0);
  assert.equal(calls, 1);
});

test("mutation invalidates a stale in-flight unread count", async () => {
  const pending = deferred();
  let countCalls = 0;
  const query = createNotificationsQuery(async (path, options) => {
    if (options) return { count: 0 };
    if (path.includes("unread-count"))
      return ++countCalls === 1 ? pending.promise : { count: 0 };
    return page();
  }, "marketplace");
  const counting = query.count();
  await Promise.resolve();
  await query.markRead();
  pending.resolve({ count: 99 });
  await counting;
  assert.equal(query.getSnapshot().count, 0);
});

test("expired session clears cached private notifications and ignores stale work", async () => {
  let expired = false;
  const query = createNotificationsQuery(async () => {
    if (expired)
      throw Object.assign(new Error("Sign in again"), { status: 401 });
    return page();
  }, "marketplace");
  await query.load();
  expired = true;
  await query.count();
  assert.equal(query.getSnapshot().items.length, 0);
  assert.equal(query.getSnapshot().sessionExpired, true);
  assert.equal(query.getSnapshot().count, null);
});

test("same-account replacement cache starts empty and cannot inherit private items", async () => {
  const old = createNotificationsQuery(async () => page(), "marketplace");
  await old.load();
  old.dispose();
  const replacement = createNotificationsQuery(
    async () => page([]),
    "marketplace",
  );
  assert.equal(replacement.getSnapshot().items.length, 0);
  assert.equal(replacement.getSnapshot().loaded, false);
  await replacement.load();
  assert.equal(replacement.getSnapshot().items.length, 0);
});
