import {
  tickets as seedTickets,
  ticketThreads as seedThreads,
} from "../data/mock.js";
import { arrayOf, hasId, isNonEmptyString, isObject } from "./guards.js";

/**
 * User-opened support tickets: one seed read, one builder, one merge — no
 * React. `Tickets` opens through `TicketsContext` and `TicketDetail` reads
 * through it, which is the only caller of this file and so the only place a
 * swap for a real API would happen.
 *
 * This replaces a version that pushed straight into the imported `tickets`
 * array and `ticketThreads` object from inside a click handler. That looked
 * like it worked — the list picked it up, the detail page opened it — right
 * up until a reload handed the browser a fresh module with the mutation
 * gone, or the id was first requested on the server, where the mutation
 * had never happened at all. A control that only works until the page it
 * changed is the thing it changed is the same bug class issue #37 exists to
 * remove; this module and its context are the fix.
 *
 * Unlike `listings.js`, the seed here is never edited or deleted, only added
 * to — so what gets persisted is the *delta* (a user's own tickets) rather
 * than a full copy of the merged state. A `mock.js` seed edited in dev is
 * never masked by a stale copy from yesterday, because the seed itself is
 * never what lands in storage.
 */

/** Nothing opened yet. */
export const EMPTY = { tickets: [], threads: {} };

/**
 * A new ticket and the thread it opens on, in the exact shapes `Tickets` and
 * `TicketDetail` already read off the mock. `id` and `openedLabel` are
 * supplied by the caller — a click handler may read `Date.now()`, this may
 * not — so the result is deterministic and safe to assert on in a test.
 */
export function buildTicket(
  { subject, body },
  id,
  openedLabel = "Opened just now",
) {
  const cleanSubject = subject.trim();
  const cleanBody = body.trim();
  return {
    ticket: {
      id,
      title: `${cleanSubject} (#${id})`,
      meta: openedLabel,
      status: "In Progress",
      icon: "MessageSquare",
    },
    thread: {
      id,
      subject: cleanSubject,
      status: "In Progress",
      opened: openedLabel,
      messages: [
        {
          id: 1,
          from: "you",
          author: "You",
          time: "Just now",
          body: cleanBody,
        },
      ],
    },
  };
}

/** A message shaped like the one `buildTicket` opens a thread with. */
function isValidMessage(m) {
  return isObject(m) && isNonEmptyString(m.from) && isNonEmptyString(m.body);
}

/**
 * A thread worth keeping, or `null`. `messages` is coerced to an array of
 * rows shaped like the ones this file writes — `TicketDetail` appends to it
 * with a plain spread (`[...thread.messages, reply]`), which assumes an
 * array is already there rather than checking.
 */
function normaliseThread(t) {
  if (!isObject(t) || !isNonEmptyString(t.id)) return null;
  return { ...t, messages: arrayOf(t.messages, isValidMessage) };
}

/**
 * The guard `rehydrate` runs a stored delta through before folding it over
 * `EMPTY` — the same pattern `normaliseWallet` in `wallet.js` set. A ticket
 * only has to carry an id: `find`/`patch` key on it and nothing else does,
 * and every other field a screen reads (`title`, `status`, `icon`) is read
 * with its own fallback everywhere but here. A `tickets` or `threads` that is
 * not the shape it claims — not an array, not an object — is dropped rather
 * than merged in, and a key neither name comes back the same way: nothing
 * downstream reads it, so keeping it is not tolerance, it is corruption left
 * for the next reader to trip over.
 */
export function normaliseTicketsState(value) {
  if (!isObject(value)) return {};
  const next = {};
  if (Array.isArray(value.tickets)) next.tickets = value.tickets.filter(hasId);
  if (isObject(value.threads)) {
    const threads = {};
    for (const [id, thread] of Object.entries(value.threads)) {
      const normalised = normaliseThread(thread);
      if (normalised) threads[id] = normalised;
    }
    next.threads = threads;
  }
  return next;
}

/**
 * The delta a user has created, one action so far: opening a ticket. A blank
 * subject or body is refused here too, not just by the form — the same
 * belt-and-braces `listings.js`'s `publish` case follows for a draft with no
 * title or photos.
 */
export function reducer(created, action) {
  switch (action.type) {
    case "create": {
      if (!action.subject?.trim() || !action.body?.trim()) return created;
      const { ticket, thread } = buildTicket(
        action,
        action.id,
        action.openedLabel,
      );
      return {
        tickets: [ticket, ...created.tickets],
        threads: { ...created.threads, [ticket.id]: thread },
      };
    }

    /**
     * Storage handing back what it kept, folded over `EMPTY` rather than
     * used as-is — the same reason `listings.js` folds a rehydrate over
     * `buildSeed()`: a key this shape has grown since the stored copy was
     * written must not arrive `undefined` at a screen that reads it.
     */
    case "rehydrate":
      return { ...EMPTY, ...normaliseTicketsState(action.state) };

    default:
      return created;
  }
}

/**
 * The seed underneath, a user's own tickets on top and listed first — the
 * order the list has always shown a new ticket in. Every value here is a
 * fresh object; `seedTickets` and `seedThreads` are never written to.
 *
 * Both spreads are deliberately shallow, and `TicketDetail` depends on it.
 * That screen seeds its local `messages` from the thread and re-seeds when
 * the thread object changes identity. Opening a second ticket re-runs this
 * function, so a deep copy here would hand back a new object for a thread
 * nothing happened to — and the reply someone had typed into the ticket they
 * were reading would be replaced by the stored copy. Shallow keeps the inner
 * threads identical, so only a thread that genuinely changed re-seeds.
 */
export function merge(created = EMPTY) {
  return {
    tickets: [...created.tickets, ...seedTickets],
    threads: { ...seedThreads, ...created.threads },
  };
}
