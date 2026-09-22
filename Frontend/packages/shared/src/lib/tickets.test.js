import test from "node:test";
import assert from "node:assert/strict";
import {
  tickets as seedTickets,
  ticketThreads as seedThreads,
} from "../data/mock.js";
import {
  EMPTY,
  buildTicket,
  merge,
  normaliseTicketsState,
  reducer,
} from "./tickets.js";

test("buildTicket is deterministic, so the server and the client agree", () => {
  const input = { subject: "Payment issue", body: "Charged twice." };
  assert.deepEqual(
    buildTicket(input, "42", "Opened just now"),
    buildTicket(input, "42", "Opened just now"),
  );
});

test("a built ticket and its thread carry every field the screens read", () => {
  const { ticket, thread } = buildTicket(
    { subject: "  Refund request  ", body: "  Still waiting.  " },
    "1700000000000",
    "Opened just now",
  );

  assert.equal(ticket.id, "1700000000000");
  assert.equal(ticket.title, "Refund request (#1700000000000)");
  assert.equal(ticket.status, "In Progress");
  assert.equal(ticket.icon, "MessageSquare");

  assert.equal(thread.id, "1700000000000");
  assert.equal(
    thread.subject,
    "Refund request",
    "trimmed, like the form's own fields",
  );
  assert.equal(thread.status, "In Progress");
  assert.equal(thread.messages.length, 1);
  assert.equal(thread.messages[0].from, "you");
  assert.equal(thread.messages[0].body, "Still waiting.");
});

test("create adds the ticket to the front of the delta", () => {
  const first = reducer(EMPTY, {
    type: "create",
    id: "1",
    subject: "First",
    body: "One.",
  });
  const second = reducer(first, {
    type: "create",
    id: "2",
    subject: "Second",
    body: "Two.",
  });

  assert.deepEqual(
    second.tickets.map((t) => t.id),
    ["2", "1"],
    "newest first",
  );
  assert.ok(second.threads["1"]);
  assert.ok(second.threads["2"]);
});

test("a blank subject or body creates nothing", () => {
  assert.equal(
    reducer(EMPTY, { type: "create", id: "1", subject: " ", body: "Hello" }),
    EMPTY,
  );
  assert.equal(
    reducer(EMPTY, { type: "create", id: "1", subject: "Hello", body: " " }),
    EMPTY,
  );
});

test("a stored delta is folded over EMPTY, never used as-is", () => {
  // A key this shape grows after some tickets were already saved must not
  // arrive `undefined` at a screen that reads it.
  const stored = { tickets: [{ id: "9", title: "Old (#9)" }] };
  const next = reducer(EMPTY, { type: "rehydrate", state: stored });

  assert.deepEqual(next.tickets, stored.tickets);
  assert.deepEqual(next.threads, {});
});

/* --------------------------------------------------------- rehydrate guard */

test("a hand-edited or stale tickets key falls back to EMPTY, never throws", () => {
  for (const junk of [null, "nonsense", 5, [], { tickets: "nope" }]) {
    const next = reducer(EMPTY, { type: "rehydrate", state: junk });
    assert.deepEqual(next, EMPTY, JSON.stringify(junk));
  }
});

test("a ticket with no id is dropped; one that is merely thin survives", () => {
  const next = reducer(EMPTY, {
    type: "rehydrate",
    state: { tickets: [{ title: "No id at all" }, { id: "9", title: "Old" }] },
  });
  assert.deepEqual(next.tickets, [{ id: "9", title: "Old" }]);
});

test("a thread with no id is dropped, and messages that are not an array become an empty one", () => {
  const next = normaliseTicketsState({
    threads: {
      9: { subject: "No id on the thread itself" },
      10: { id: "10", subject: "Fine", messages: "not an array" },
      11: { id: "11", messages: [{ from: "you", body: "kept" }, "junk"] },
    },
  });
  assert.equal(next.threads["9"], undefined);
  assert.deepEqual(next.threads["10"].messages, []);
  assert.deepEqual(next.threads["11"].messages, [
    { from: "you", body: "kept" },
  ]);
});

test("merge lays the seed underneath and a user's own tickets on top", () => {
  const created = reducer(EMPTY, {
    type: "create",
    id: "new-1",
    subject: "New ticket",
    body: "Body.",
  });
  const state = merge(created);

  assert.deepEqual(
    state.tickets.map((t) => t.id),
    ["new-1", ...seedTickets.map((t) => t.id)],
    "created tickets lead, seed tickets follow in their existing order",
  );
  assert.ok(state.threads["new-1"]);
  for (const id of Object.keys(seedThreads)) {
    assert.ok(state.threads[id], `seed thread ${id} is still reachable`);
  }
});

test("merge with nothing created is just the seed", () => {
  assert.deepEqual(merge(EMPTY).tickets, seedTickets);
  assert.deepEqual(merge(EMPTY).threads, seedThreads);
  assert.deepEqual(merge(), merge(EMPTY), "EMPTY is the default");
});

test("nothing here ever mutates the seed module's own objects", () => {
  const seedTicketsLength = seedTickets.length;
  const seedThreadIds = Object.keys(seedThreads);

  reducer(EMPTY, { type: "create", id: "x", subject: "X", body: "Y" });
  merge(reducer(EMPTY, { type: "create", id: "x", subject: "X", body: "Y" }));

  assert.equal(seedTickets.length, seedTicketsLength);
  assert.deepEqual(Object.keys(seedThreads), seedThreadIds);
  assert.equal(seedThreads.x, undefined, "the seed module gained no keys");
});
