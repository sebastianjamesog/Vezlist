# Admin panel — implementation plan

One console planned for `admin.vezlist.cc` managing both sites. It currently
uses mock data and must remain local until Spring Boot staff authentication is
integrated. See `MIGRATION.md` for the replacement-frontend rollout.
Approved design; this is the build order.

- **Placement** — new workspace `apps/admin`, screens in `packages/shared/src/admin/`
- **Data** — mutable reducer seeded from `mock.js`, persisted to localStorage
- **Scope** — all eighteen sections
- **Honest limit** — admin edits do not reach the public sites (three origins,
  three storages, no server). Swapping to an API is one file: `AdminDataContext`.

---

## Decisions already settled

| Question                  | Answer                                              | Why                                                               |
| ------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Where                     | `apps/admin`, port 3102, worker `vezlist-new-admin` | isolated replacement build; no age gate, no phone shell           |
| Both sites in one console | yes — `site` is a column, not a fork                | `listings` and `personalsListings` derive from one `allListings`  |
| Writes                    | reducer + `usePersistedObject("vezlist:admin:v1")`  | matches how Auth/Saved/Status already fake state                  |
| Admin session             | `localStorage`, **not** the shared cookie           | per-origin isolation is free; a signed-in shopper is not an admin |
| Roles                     | one role                                            | skipped — add tiers when a second admin persona exists            |
| Charts                    | inline SVG sparkline                                | no chart library for four dashboard tiles                         |
| Tables                    | one `DataTable`                                     | one component serves all eighteen sections                        |
| Tailwind                  | no change needed                                    | `@source "../../../apps/*/app/**"` already globs `apps/admin`     |

---

## Phase 0 — foundation

Nothing renders until this lands. Everything after it is a screen.

### 0.1 Workspace scaffold

```
apps/admin/
  package.json          "@vezlist/admin", dev --port 3102
  next.config.mjs       transpilePackages + env NEXT_PUBLIC_SITE: "admin"
  postcss.config.mjs    copied
  open-next.config.ts   copied
  wrangler.jsonc        name vezlist-admin, r2 vezlist-admin-next-cache
  .env.production       + NEXT_PUBLIC_ADMIN_URL
  app/
    layout.jsx          Inter, metadata { robots: { index: false } }
    providers.jsx       AdminAuth -> AdminData -> Toast
    icon.svg  not-found.jsx
```

Root `package.json`: add `dev:admin`, `build:admin`, `deploy:admin`, and
`deploy:admin` into `deploy:all`.

Bucket, once, before first deploy:

```bash
npx wrangler r2 bucket create vezlist-admin-next-cache
```

### 0.2 `lib/sites.js` (edit)

Add `IS_ADMIN` and `ADMIN_URL` beside the existing two. Nothing else in shared
changes shape — `IS_PERSONALS` stays false in the admin bundle, so shared
components keep their marketplace defaults.

### 0.3 `data/mock.js` (edit) — two new seeds

- `reports[]` — the one shape the apps have no data for:
  `{ id, site, targetType: "listing"|"user"|"stream", targetId, reason,
reporter, status: "open"|"resolved"|"dismissed", createdMsAgo }`. ~8 rows.
- `adminUsers[]` — `{ id, name, email, avatar }`. The audit log needs an actor.
- `pendingTitles` — a `Set` of listing titles seeded into review, the same
  idiom `boostedTitles` already uses. Without it the moderation queue is empty.

### 0.4 `lib/adminStore.js` + `lib/adminStore.test.js`

Pure. No React. This is the file to read to understand the admin.

`buildSeed()` folds `mock.js` into one admin-shaped state:

```js
{
  listings: [],      // both sites merged, + site, status, views, saves
  users: [],         // sellers + people + profile, + kind, status
  tickets: [],       // tickets joined to ticketThreads.messages
  reports: [],
  streams: [],       // liveStreams + status: live | ended
  stories: [],
  faqs: [], faqCategories: [], topics: [],
  categories: [], homeCategories: [], provinces: [],
  notifications: [], broadcasts: [],
  creditPacks: [], billing: [], paymentMethods: [],
  settings: {},
  audit: [],
}
```

Two rules the seed must hold:

- **No randomness.** Views and saves for listings with no `myAds` row are
  derived from a hash of the id, not `Math.random()` — a random seed renders one
  number on the server and another on the client and React throws out the tree.
- **`site` is stamped once**, at seed time, from which array a listing came out
  of. Every screen filters on it; nothing re-derives it.

`reducer(state, action)` — every admin verb, one action each:

```
approve · reject(reason) · toggleVerified · setBoost · expire · deleteListing
suspendUser · unsuspendUser · verifyUser
replyTicket · setTicketStatus
resolveReport · dismissReport
endStream · verifyHost · removeUpdate
upsertFaq · deleteFaq · upsertTopic
upsertCategory · deleteCategory · reorderCategories · setHomeCategories
addArea · removeArea
sendBroadcast
upsertCreditPack · deleteCreditPack
setSetting · resetToSeed
```

Every handler appends one audit entry
`{ id, at, actor, action, entity, entityId, note }`, newest first.

```js
// ponytail: audit capped at 200 entries — page it out of a real store when
// there is one to page.
```

`adminStore.test.js` (`node:test`, matching `lib/*.test.js`): seed shape,
approve moves `pending -> active`, reject records the reason, delete removes the
row, audit grows and caps, `resetToSeed` returns a clean seed. ~10 cases.

### 0.5 `context/AdminDataContext.jsx`

Thin. `useReducer(reducer, undefined, buildSeed)` plus
`usePersistedObject("vezlist:admin:v1")` to rehydrate and write back. Version in
the key so editing `mock.js` in dev is not masked by stale storage.

Exposes `{ state, dispatch, ready, reset }`. Screens never import `mock.js`
directly — that is what keeps the API swap to one file.

### 0.6 `context/AdminAuthContext.jsx` + `components/admin/RequireAdmin.jsx`

Mirror of `AuthContext` / `RequireAuth`, but `usePersistedObject` on its default
localStorage store rather than `cookieStore` — per-origin, so it cannot be
granted by a public session. Same honesty: the shape is real, the server is not.

### 0.7 Admin UI kit — `components/admin/`

Build five:

| Component     | Job                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `AdminLayout` | 240px fixed rail, icon-only under `xl`, drawer under `lg`; top bar with site switcher + admin menu |
| `DataTable`   | `columns` config, sort, bulk-select, row click, empty state, 25/page prev-next                     |
| `StatusBadge` | one tone map for every status word in the console                                                  |
| `StatCard`    | dashboard tile: label, value, delta                                                                |
| `Sparkline`   | inline SVG, ~30 lines                                                                              |

Reuse unchanged: `Button` (5 variants), `SearchBar`, `SegmentedControl` (tabs),
`Modal`, `ConfirmDialog`, `EmptyState`, `Icon`, `Field` + `FIELD` + `border`.

Not adding: a chart library, a table library, a form library.

`components/admin/adminNav.js` — one nav source the rail and the drawer both
read, the way `navItems.js` already serves both public bars.

The public `AppLayout` / `BottomNav` / phone shell are **not** reused: five
slots do not hold eighteen sections.

**Phase 0 done when** `npm run dev:admin` serves a signed-in empty shell with a
working rail, and `npm test` passes with `adminStore.test.js` green.

---

## Phase 1 — moderation

The queue is why the console exists; it ships first.

| Route            | Screen                    | Actions                                                                  |
| ---------------- | ------------------------- | ------------------------------------------------------------------------ |
| `/`              | `admin/Dashboard.jsx`     | stat cards, pending preview, audit feed, revenue sparkline               |
| `/listings`      | `admin/Listings.jsx`      | filters (status, site, category, verified, boosted); bulk approve/reject |
| `/listings/[id]` | `admin/ListingDetail.jsx` | photos, description, seller, moderation panel, per-ad audit trail        |
| `/reports`       | `admin/Reports.jsx`       | resolve, dismiss, jump to target                                         |

Reject opens a `Modal` with a reason — a rejection with no reason is a support
ticket waiting to happen, and the reason is what the audit entry carries.

Filters live in the URL (`?status=pending&site=personals`), so a queue view is a
link a second moderator can be sent.

---

## Phase 2 — people

| Route         | Screen           | Source                           | Actions                                           |
| ------------- | ---------------- | -------------------------------- | ------------------------------------------------- |
| `/users`      | `Users.jsx`      | `sellers` + `people` + `profile` | suspend, unsuspend, verify                        |
| `/users/[id]` | `UserDetail.jsx` | + their listings, tickets, audit | same, in context                                  |
| `/live`       | `Live.jsx`       | `liveStreams`                    | end stream, verify host — cover grid, not a table |
| `/status`     | `Status.jsx`     | `stories[].updates`              | remove update, remove story — media grid          |

Live and Status are grids because the media _is_ the moderation signal; a table
of filenames tells a moderator nothing.

Both carry the personals blur treatment behind a **Reveal media** toggle, so the
console is safe to open in an office. Default blurred, the same rule
`useDiscreet` already applies over `[data-media]`.

---

## Phase 3 — support and content

| Route           | Screen             | Notes                                                                                                                  |
| --------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `/tickets`      | `Tickets.jsx`      | filter by status, sort by age                                                                                          |
| `/tickets/[id]` | `TicketDetail.jsx` | agent console — `ticketThreads` already models `from: "agent"`, so the reply box appends rather than inventing a shape |
| `/content`      | `Content.jsx`      | tabs: FAQs, topics, contact channels; full CRUD                                                                        |

---

## Phase 4 — config and money

| Route            | Screen              | Notes                                                                                                          |
| ---------------- | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/taxonomy`      | `Taxonomy.jsx`      | categories add/edit/reorder + `primary` toggle; `homeCategories` is exactly nine, ordered; provinces and areas |
| `/notifications` | `Notifications.jsx` | compose broadcast (title, body, tone, icon, target site), history                                              |
| `/billing`       | `Billing.jsx`       | tabs: history, credit packs, promotions (`boosted` start/stop)                                                 |
| `/settings`      | `Settings.jsx`      | age-gate copy, discreet default, feature flags, **Reset to seed**                                              |

`/settings` states the limitation on the page itself rather than only in this
file: these flags write to the admin store, not to the live sites.

---

## Route stubs

Every `apps/admin/app/(admin)/**/page.jsx` is a one-line re-export, the way the
public apps already do it:

```jsx
export { default } from "@vezlist/shared/admin/Listings.jsx";
```

Screens reading a query parameter need a `<Suspense>` boundary — a prerendered
page has nothing else to stream it into. That is the same reason `browse/` and
`nearby/` are split in two files today.

---

## Verification

```bash
npm test                 # adminStore.test.js green
npm run dev:admin        # :3102
npm run build:admin
npx oxlint
```

Per phase, by hand: sign in, take one action, reload the page, confirm it stuck,
confirm the audit entry names the actor, then **Reset to seed**.

No component test framework exists in this repo and this plan does not add one.
The reducer is pure and holds every mutation, which is the half worth testing.

---

## Deliberately skipped

Revised after the first build. Four of the six original entries have since been
built; what is left is listed below with the reason it is still out.

| Skipped                                        | Add when                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Real backend (D1, route handlers, sessions)    | the console needs to move real data. This is the one that still matters: every write lands in the console’s own localStorage, and `/settings` says so on the page. |
| Server-side pagination                         | the dataset outgrows a client slice                                                                                                                                |
| Component tests                                | a component breaks twice. The reducer is pure and holds every mutation, which is the half worth testing — 42 cases and counting.                                   |
| Cross-origin write-through to the public sites | there is a server to write through                                                                                                                                 |

### Since built — and why the original call was wrong

| Was skipped   | Built as                                              | Why it changed                                                                                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role tiers    | `lib/adminRoles.js` + `/admins`                       | "Add tiers when a second admin persona exists" — there are now three. Enforced in the screens _and_ in the reducer, because a hidden button is not an access check.                                                                                                                                   |
| —             | `admin/Analytics.jsx` at `/analytics`                 | Everything the phase tables above list is a queue or a record; nothing charted what the store already knows. Site-scoped like the moderation screens, gated behind `analytics.view`, and derives every number and series from `lib/adminStore.js` — no figure here is invented to make a line go up.  |
| —             | `admin/Audit.jsx` at `/audit`                         | The Dashboard row above only ever promised "audit feed" as a top-7 glance (`admin/Dashboard.jsx`); this is the full trail that glance links out to when the question is "show me everything Priya did" rather than "what happened lately". Not site-scoped — an audit entry has no `site` of its own. |
| Chart library | `components/admin/Charts.jsx`                         | Still no library: the charts are HTML, so a 24px bar cap and a 2px surface gap are literal rather than viewBox-relative.                                                                                                                                                                              |
| —             | Listing edit + per-photo removal                      | Correcting an ad is usually kinder than rejecting it, and a bad photo rarely means a bad ad.                                                                                                                                                                                                          |
| —             | Ticket assignment, canned replies, SLA flags          | A queue nobody owns is the queue that ages.                                                                                                                                                                                                                                                           |
| —             | Refunds and credit adjustment                         | Support could see the money and not move it.                                                                                                                                                                                                                                                          |
| —             | Bulk actions on users, CSV export, personals taxonomy | Gaps found by review and by using the thing.                                                                                                                                                                                                                                                          |
